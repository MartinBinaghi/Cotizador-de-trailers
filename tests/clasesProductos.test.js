import 'fake-indexeddb/auto'
import { test, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import Dexie from 'dexie'
import { db, exportarBackup, analizarBackup, combinarBackup, guardarBorrador } from '../src/db/database.js'
import { perteneceAClase, CLASES_INICIALES } from '../src/utils/clasesProductos.js'
import { guardarCategoria, guardarVariable } from '../src/db/catalogo.js'

beforeEach(async () => { await db.delete() })
after(async () => { await db.delete() })

test('migra v5 conservando ids, precios, historial y borrador', async () => {
  const vieja = new Dexie(db.name)
  vieja.version(5).stores({
    tiposTrailer: '++id, nombre, precioBase', categorias: '++id, &nombre',
    variables: '++id, categoria, nombre, tipoModificador, valor, aplicaSobre',
    cotizaciones: '++id, tipoTrailerId, fecha, precioFinal', config: 'clave'
  })
  await vieja.open()
  await vieja.tiposTrailer.add({ id: 8, nombre: 'Modelo viejo', precioBase: 123, ganancia: 1.3 })
  await vieja.categorias.add({ id: 6, nombre: 'Accesorios', esDescuento: false })
  await vieja.variables.add({ id: 9, categoria: 'Accesorios', nombre: 'Luz', valor: 15 })
  await vieja.variables.add({ id: 10, categoria: 'Sin registro', nombre: 'Extra', valor: 20 })
  await vieja.cotizaciones.add({ id: 2, tipoTrailerId: 8, variablesSeleccionadas: [{ id: 9, cantidad: 2 }], precioFinal: 150, snapshot: { base: 123 } })
  const borrador = { tipoTrailerId: '8', nombreCliente: 'Cliente', seleccionadas: { 9: 2 } }
  await vieja.config.put({ clave: 'borradorCotizador', valor: borrador })
  vieja.close()
  await db.open()
  assert.deepEqual(await db.clasesProductos.toArray(), CLASES_INICIALES.toSorted((a, b) => a.id.localeCompare(b.id)))
  assert.equal((await db.tiposTrailer.get(8)).claseId, 'trailers')
  assert.equal((await db.tiposTrailer.get(8)).precioBase, 123)
  assert.equal((await db.variables.get(9)).categoriaId, 6)
  assert.equal((await db.variables.get(10)).claseId, 'trailers')
  assert.ok(await db.categorias.get((await db.variables.get(10)).categoriaId))
  assert.equal((await db.cotizaciones.get(2)).precioFinal, 150)
  assert.deepEqual((await db.config.get('borradorCotizador')).valor, borrador)
})

test('una instalación nueva crea clases sin poblar productos', async () => {
  await db.open()
  assert.equal(await db.clasesProductos.count(), 3)
  assert.equal(await db.tiposTrailer.count(), 0)
  assert.equal(await db.variables.count(), 0)
})

test('el filtro no cruza clases y Universal alcanza a clases futuras', () => {
  assert.equal(perteneceAClase({ claseId: 'trailers' }, 'cajas'), false)
  assert.equal(perteneceAClase({ claseId: 'universal' }, 'futura'), true)
  assert.equal(perteneceAClase({ claseId: 'cajas' }, 'universal'), false)
})

test('importa backups antiguos como Trailers, sin tocar la selección local', async () => {
  await db.open()
  await db.config.put({ clave: 'claseSeleccionada:catalogo', valor: 'cajas' })
  const analisis = await analizarBackup({ version: 1,
    tiposTrailer: [{ id: 4, nombre: 'Viejo', precioBase: 100 }],
    variables: [{ id: 7, nombre: 'Freno', categoria: 'Accesorios', valor: 10 }],
    cotizaciones: [{ id: 9, tipoTrailerId: 4, cliente: 'Cliente', fecha: '2020-01-01', precioFinal: 110, variablesSeleccionadas: [7] }]
  })
  await combinarBackup(analisis, false)
  const variable = await db.variables.toCollection().first()
  assert.equal(variable.claseId, 'trailers')
  assert.equal((await db.categorias.get(variable.categoriaId)).nombre, 'Accesorios')
  assert.equal((await db.config.get('claseSeleccionada:catalogo')).valor, 'cajas')
  assert.equal((await db.cotizaciones.toCollection().first()).cliente.nombreCliente, 'Cliente')
})

test('remapea clases y categorías homónimas con ids diferentes entre instalaciones', async () => {
  await db.open()
  await db.clasesProductos.add({ id: 'local-especial', nombre: 'Carrocerías' })
  const localCat = await db.categorias.add({ nombre: 'Accesorios', claseId: 'trailers' })
  await db.variables.add({ nombre: 'Luz', categoria: 'Accesorios', categoriaId: localCat, claseId: 'trailers', valor: 99 })
  const data = { version: 2, clasesProductos: [...CLASES_INICIALES, { id: 'remoto-especial', nombre: 'Carrocerías' }],
    tiposTrailer: [{ id: 90, nombre: 'Especial', claseId: 'remoto-especial', precioBase: 100 }],
    categorias: [{ id: 70, nombre: 'Accesorios', claseId: 'trailers' }, { id: 80, nombre: 'Accesorios', claseId: 'cajas' }],
    variables: [{ id: 50, nombre: 'Luz', categoriaId: 70, categoria: 'Accesorios', claseId: 'trailers', valor: 5 },
      { id: 60, nombre: 'Luz', categoriaId: 80, categoria: 'Accesorios', claseId: 'cajas', valor: 6 }],
    cotizaciones: [{ id: 1, claseId: 'remoto-especial', tipoTrailerId: 90, variablesSeleccionadas: [60], precioFinal: 106, fecha: '2026-01-01', cliente: {} }]
  }
  const analisis = await analizarBackup(data)
  assert.equal(analisis.clasesProductos.nuevos.length, 0)
  assert.equal(analisis.variables.nuevos.length, 1)
  assert.equal(analisis.variables.duplicados.length, 1)
  await combinarBackup(analisis, false)
  const vars = await db.variables.toArray()
  assert.equal(vars.find(v => v.claseId === 'trailers').valor, 99)
  const cajas = vars.find(v => v.claseId === 'cajas')
  assert.equal((await db.categorias.get(cajas.categoriaId)).claseId, 'cajas')
  const cotizacion = await db.cotizaciones.toCollection().first()
  assert.equal(cotizacion.claseId, 'local-especial')
  assert.equal((await db.tiposTrailer.get(cotizacion.tipoTrailerId)).claseId, 'local-especial')
  const segunda = await analizarBackup(await exportarBackup())
  assert.equal(segunda.variables.nuevos.length, 0)
  await combinarBackup(await analizarBackup(data), true)
  assert.equal((await db.variables.filter(v => v.claseId === 'trailers').first()).valor, 5)
})

test('una escritura atrasada no revive el borrador al cambiar de clase', async () => {
  await db.open()
  await guardarBorrador('cotizador', 'borradorCotizador', 'trailers', { nombreCliente: 'Viejo' })
  await db.transaction('rw', db.config, async () => {
    await db.config.delete('borradorCotizador')
    await db.config.put({ clave: 'claseSeleccionada:cotizador', valor: 'cajas' })
  })
  await guardarBorrador('cotizador', 'borradorCotizador', 'trailers', { nombreCliente: 'Viejo' })
  assert.equal(await db.config.get('borradorCotizador'), undefined)
  await guardarBorrador('cotizador', 'borradorCotizador', 'cajas', { nombreCliente: '' })
  assert.equal((await db.config.get('borradorCotizador')).valor.claseId, 'cajas')
})

test('solo admite variables de la clase de la categoría o bajo una categoría Universal', async () => {
  await db.open()
  const trailer = await guardarCategoria({ nombre: 'Accesorios', claseId: 'trailers' })
  const universal = await guardarCategoria({ nombre: 'Comunes', claseId: 'universal' })
  const base = { nombre: 'Pintura negra', tipoModificador: 'fijo', valor: 100, aplicaSobre: 'base' }
  await assert.rejects(guardarVariable({ ...base, claseId: 'universal', categoriaId: trailer }), /categoría Universal/)
  await assert.rejects(guardarVariable({ ...base, claseId: 'cajas', categoriaId: trailer }), /misma clase/)
  await assert.rejects(guardarVariable({ ...base, claseId: 'cajas' }), /Seleccioná una categoría/)
  const id = await guardarVariable({ ...base, claseId: 'trailers', categoriaId: trailer })
  await assert.rejects(guardarVariable({ ...base, id, claseId: 'universal', categoriaId: trailer }), /categoría Universal/)
  assert.equal((await db.variables.get(id)).claseId, 'trailers')
  await guardarVariable({ ...base, id, claseId: 'universal', categoriaId: universal })
  assert.equal((await db.variables.get(id)).claseId, 'universal')
  await guardarVariable({ ...base, claseId: 'cajas', categoriaId: universal })
})

test('impide cambiar una categoría si deja variables incompatibles, sin cambios parciales', async () => {
  await db.open()
  const id = await guardarCategoria({ nombre: 'Comunes', claseId: 'universal' })
  const variableId = await guardarVariable({ nombre: 'Pintura', claseId: 'universal', categoriaId: id, tipoModificador: 'fijo', valor: 50 })
  await assert.rejects(guardarCategoria({ id, nombre: 'Nuevo nombre', claseId: 'trailers' }), /incompatible/)
  assert.equal((await db.categorias.get(id)).nombre, 'Comunes')
  assert.equal((await db.variables.get(variableId)).categoria, 'Comunes')
  await guardarVariable({ ...(await db.variables.get(variableId)), claseId: 'trailers' })
  await guardarCategoria({ id, nombre: 'Accesorios', claseId: 'trailers' })
  assert.equal((await db.variables.get(variableId)).categoria, 'Accesorios')
})

test('categorías homónimas por clase y alta conjunta de variable/categoría son atómicas', async () => {
  await db.open()
  await guardarCategoria({ nombre: 'Accesorios', claseId: 'trailers' })
  await guardarCategoria({ nombre: 'Accesorios', claseId: 'cajas' })
  await assert.rejects(guardarCategoria({ nombre: ' accesorios ', claseId: 'cajas' }), /Ya existe/)
  await assert.rejects(guardarVariable({ nombre: 'Pintura', claseId: 'universal', valor: 20, tipoModificador: 'fijo' },
    { nombre: 'Nueva', claseId: 'trailers' }), /Universal/)
  assert.equal(await db.categorias.count(), 2)
  assert.equal(await db.variables.count(), 0)
})

test('rechaza backups con variables universales dentro de categorías exclusivas', async () => {
  await db.open()
  const data = { version: 2, clasesProductos: CLASES_INICIALES, tiposTrailer: [],
    categorias: [{ id: 1, nombre: 'Accesorios', claseId: 'trailers' }],
    variables: [{ id: 1, nombre: 'Pintura', claseId: 'universal', categoriaId: 1 }] }
  await assert.rejects(analizarBackup(data), /categoría Universal/)
  assert.equal(await db.categorias.count(), 0)
})
