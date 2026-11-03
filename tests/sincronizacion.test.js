import 'fake-indexeddb/auto'
import { test, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '../src/db/database.js'
import { exportarEstado, aplicarEstado, sincronizarCarpeta, priorizarDatosLocales } from '../src/db/sincronizacion.js'

beforeEach(async () => { await db.delete(); await db.open() })
after(async () => { await db.delete() })

const esperarMarcas = () => new Promise(resuelve => setTimeout(resuelve, 20))

async function cargarCatalogo() {
  const categoriaId = await db.categorias.add({ nombre: 'Frenos', claseId: 'trailers', esDescuento: false })
  const tipoId = await db.tiposTrailer.add({ nombre: 'Batea', claseId: 'trailers', precioBase: 1000 })
  const variableId = await db.variables.add({ nombre: '4 frenos', categoria: 'Frenos', categoriaId, claseId: 'trailers',
    valor: 300, tipoModificador: 'fijo', aplicaSobre: 'base' })
  return { categoriaId, tipoId, variableId }
}

/** Simula el archivo de otro equipo: el estado de esta base, con ids que no coinciden con los locales. */
async function estadoRemoto() {
  return structuredClone(await exportarEstado(db))
}

test('altas y ediciones locales quedan selladas; los borrados dejan marca', async () => {
  const { variableId } = await cargarCatalogo()
  const creada = await db.variables.get(variableId)
  assert.match(creada.uid, /^[0-9a-f-]{36}$/)
  assert.ok(creada.actualizado > 0)
  await new Promise(r => setTimeout(r, 5))
  await db.variables.update(variableId, { valor: 350 })
  assert.ok((await db.variables.get(variableId)).actualizado > creada.actualizado)
  await db.variables.delete(variableId)
  await esperarMarcas()
  const marca = await db.eliminados.get(`variables:${creada.uid}`)
  assert.equal(marca.uid, creada.uid)
})

test('el cambio remoto más reciente gana y el más viejo se ignora', async () => {
  const { variableId } = await cargarCatalogo()
  const remoto = await estadoRemoto()
  const variable = remoto.variables[0]
  variable.valor = 999
  variable.actualizado = Date.now() + 10_000
  assert.equal(await aplicarEstado(db, remoto), 1)
  assert.equal((await db.variables.get(variableId)).valor, 999)

  variable.valor = 1
  variable.actualizado = 5
  assert.equal(await aplicarEstado(db, remoto), 0)
  assert.equal((await db.variables.get(variableId)).valor, 999)
})

test('aplicar no sella fechas ni genera borrados: no hay rebote entre equipos', async () => {
  await cargarCatalogo()
  const antes = await exportarEstado(db)
  const remoto = structuredClone(antes)
  remoto.tiposTrailer[0].precioBase = 2000
  remoto.tiposTrailer[0].actualizado += 1000
  await aplicarEstado(db, remoto)
  const tipo = (await db.tiposTrailer.toArray())[0]
  assert.equal(tipo.actualizado, remoto.tiposTrailer[0].actualizado)
  assert.equal(await aplicarEstado(db, remoto), 0)
  assert.equal(await db.eliminados.count(), 0)
})

test('un registro nuevo de otro equipo llega con sus referencias traducidas a ids locales', async () => {
  const { categoriaId } = await cargarCatalogo()
  const remoto = await estadoRemoto()
  const categoriaUid = (await db.categorias.get(categoriaId)).uid
  const tipoUid = remoto.tiposTrailer[0].uid
  const variableUid = remoto.variables[0].uid
  remoto.variables.push({ uid: 'uid-nueva', nombre: 'Freno homologado', categoria: 'Frenos', categoriaUid,
    claseId: 'trailers', valor: 100, tipoModificador: 'fijo', aplicaSobre: 'base', actualizado: Date.now() })
  remoto.cotizaciones.push({ uid: 'uid-cotizacion', claseId: 'trailers', tipoUid, fecha: '2026-10-01T10:00:00.000Z',
    precioFinal: 1400, cliente: { nombreCliente: 'Cliente remoto', razonSocial: '', cuit: '' },
    variablesSeleccionadas: [{ uid: variableUid, cantidad: 1 }, { uid: 'uid-nueva', cantidad: 2 }], actualizado: Date.now() })
  assert.equal(await aplicarEstado(db, remoto), 2)
  const nueva = await db.variables.where('uid').equals('uid-nueva').first()
  assert.equal(nueva.categoriaId, categoriaId)
  assert.equal('categoriaUid' in nueva, false)
  const cotizacion = await db.cotizaciones.where('uid').equals('uid-cotizacion').first()
  assert.equal(cotizacion.tipoTrailerId, (await db.tiposTrailer.toArray())[0].id)
  const idsElegidos = cotizacion.variablesSeleccionadas.map(s => s.id).sort()
  const idsEsperados = (await db.variables.toArray()).map(v => v.id).sort()
  assert.deepEqual(idsElegidos, idsEsperados)
})

test('un borrado remoto elimina el registro, salvo que la edición local sea posterior', async () => {
  const { tipoId, variableId } = await cargarCatalogo()
  const tipo = await db.tiposTrailer.get(tipoId)
  const variable = await db.variables.get(variableId)
  await aplicarEstado(db, { eliminados: [
    { clave: `tiposTrailer:${tipo.uid}`, tabla: 'tiposTrailer', uid: tipo.uid, fecha: tipo.actualizado + 1 },
    { clave: `variables:${variable.uid}`, tabla: 'variables', uid: variable.uid, fecha: variable.actualizado - 1 }
  ] })
  assert.equal(await db.tiposTrailer.get(tipoId), undefined)
  assert.ok(await db.variables.get(variableId))
  // El registro borrado no vuelve aunque otro equipo todavía lo tenga en su archivo.
  assert.equal(await aplicarEstado(db, { tiposTrailer: [tipo] }), 0)
  assert.equal(await db.tiposTrailer.count(), 0)
})

test('lo cargado por separado en dos equipos se unifica sin duplicar (gana el uid menor)', async () => {
  await cargarCatalogo()
  const remoto = await estadoRemoto()
  for (const tabla of ['tiposTrailer', 'categorias', 'variables']) {
    for (const r of remoto[tabla]) r.uid = '0' + r.uid.slice(1)
  }
  for (const v of remoto.variables) v.categoriaUid = remoto.categorias[0].uid
  remoto.tiposTrailer[0].precioBase = 1500
  remoto.tiposTrailer[0].actualizado += 1000
  await aplicarEstado(db, remoto)
  assert.equal(await db.tiposTrailer.count(), 1)
  assert.equal(await db.categorias.count(), 1)
  assert.equal(await db.variables.count(), 1)
  const tipo = (await db.tiposTrailer.toArray())[0]
  assert.equal(tipo.uid, remoto.tiposTrailer[0].uid)
  assert.equal(tipo.precioBase, 1500)
})

test('una clase creada en los dos equipos con el mismo nombre se toma como la misma', async () => {
  await db.clasesProductos.add({ id: 'clase-local', nombre: 'Carrocerías' })
  await aplicarEstado(db, {
    clasesProductos: [{ id: 'clase-remota', nombre: 'Carrocerías', actualizado: Date.now() }],
    tiposTrailer: [{ uid: 'uid-tipo', nombre: 'Furgón', claseId: 'clase-remota', precioBase: 10, actualizado: Date.now() }]
  })
  assert.equal(await db.clasesProductos.where('nombre').equals('Carrocerías').count(), 1)
  assert.equal((await db.tiposTrailer.toArray())[0].claseId, 'clase-local')
})

test('priorizar los datos locales hace que ganen a la versión de la carpeta', async () => {
  const { tipoId } = await cargarCatalogo()
  const remoto = await estadoRemoto()
  remoto.tiposTrailer[0].precioBase = 5
  await db.tiposTrailer.toCollection().modify({ actualizado: 0 })
  remoto.tiposTrailer[0].actualizado = 100
  await priorizarDatosLocales(db)
  await aplicarEstado(db, remoto)
  assert.equal((await db.tiposTrailer.get(tipoId)).precioBase, 1000)
})

test('la carpeta: escribe el archivo propio y solo vuelve a leer los que cambiaron', async () => {
  await cargarCatalogo()
  const carpeta = new Map()
  let lecturas = 0
  const io = {
    listar: async () => [...carpeta].map(([nombre, { modificado }]) => ({ nombre, modificado })),
    leer: async nombre => { lecturas++; return carpeta.get(nombre).texto },
    escribir: async (nombre, texto) => carpeta.set(nombre, { texto, modificado: Date.now() })
  }
  const otro = await estadoRemoto()
  otro.tiposTrailer.push({ uid: 'uid-otro', nombre: 'Tanque', claseId: 'trailers', precioBase: 9, actualizado: Date.now() })
  carpeta.set('cotizador-sync-otro.json', { texto: JSON.stringify({ formato: 1, ...otro }), modificado: 1 })
  carpeta.set('notas.txt', { texto: 'ajeno', modificado: 1 })

  const leidos = new Map()
  const primera = await sincronizarCarpeta(db, io, { equipo: 'este', escribir: false, leidos })
  assert.equal(primera.cambios, 1)
  assert.ok(carpeta.has('cotizador-sync-este.json'), 'escribe su archivo aunque no haya cambios locales')
  const propio = JSON.parse(carpeta.get('cotizador-sync-este.json').texto)
  assert.equal(propio.equipo, 'este')
  assert.equal(propio.tiposTrailer.length, 2)

  await sincronizarCarpeta(db, io, { equipo: 'este', escribir: false, leidos })
  assert.equal(lecturas, 1)
  carpeta.get('cotizador-sync-otro.json').modificado = 2
  await sincronizarCarpeta(db, io, { equipo: 'este', escribir: false, leidos })
  assert.equal(lecturas, 2)
})

test('con un catálogo grande sin cambios la transacción no se cierra antes de tiempo', async () => {
  // Regresión: con ~100 registros iguales seguidos fallaba con "Transaction committed too early".
  const categorias = []
  for (let i = 0; i < 19; i++) categorias.push(await db.categorias.add({ nombre: `Cat ${i}`, claseId: 'trailers', esDescuento: false }))
  for (let i = 0; i < 47; i++) await db.tiposTrailer.add({ nombre: `Tipo ${i}`, claseId: 'trailers', precioBase: 1000 + i })
  for (let i = 0; i < 104; i++) {
    await db.variables.add({ nombre: `Var ${i}`, categoria: `Cat ${i % 19}`, categoriaId: categorias[i % 19],
      claseId: 'trailers', valor: i, tipoModificador: 'fijo', aplicaSobre: 'base' })
  }
  const remoto = await estadoRemoto()
  const ultima = remoto.variables.at(-1)
  ultima.valor = 999
  ultima.actualizado = Date.now() + 1000
  assert.equal(await aplicarEstado(db, remoto), 1)
  assert.equal(await aplicarEstado(db, remoto), 0)
})

test('rechaza el archivo de una versión más nueva del cotizador', async () => {
  const io = {
    listar: async () => [{ nombre: 'cotizador-sync-otro.json', modificado: 1 }],
    leer: async () => JSON.stringify({ formato: 99 }),
    escribir: async () => {}
  }
  await assert.rejects(sincronizarCarpeta(db, io, { equipo: 'este' }), /versión más nueva/)
})
