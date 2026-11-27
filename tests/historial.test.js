import 'fake-indexeddb/auto'
import { test, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { db, actualizarPreciosPorcentaje, exportarBackup, analizarBackup, combinarBackup } from '../src/db/database.js'
import { deshacer, rehacer, volverA } from '../src/db/historial.js'
import { aplicarEstado, exportarEstado } from '../src/db/sincronizacion.js'
import { eliminarClase } from '../src/db/eliminarClase.js'

beforeEach(async () => { await db.delete(); await db.open() })
after(async () => { await db.delete() })

// Los pasos se guardan al confirmar la transacción, en otra transacción.
const esperar = () => new Promise(r => setTimeout(r, 20))
const pasos = async () => (await db.historial.toArray()).map(p => [p.descripcion, Boolean(p.deshecho)])

test('deshacer y rehacer un alta, una edición y un borrado', async () => {
  const id = await db.tiposTrailer.add({ nombre: 'Batea', claseId: 'trailers', precioBase: 1000 }); await esperar()
  await db.tiposTrailer.update(id, { precioBase: 1500 }); await esperar()
  await db.tiposTrailer.delete(id); await esperar()
  assert.deepEqual(await pasos(), [
    ['Agregó tipo de producto «Batea»', false],
    ['Editó tipo de producto «Batea»', false],
    ['Eliminó tipo de producto «Batea»', false]
  ])

  await deshacer(db)
  assert.equal((await db.tiposTrailer.get(id)).precioBase, 1500, 'vuelve el borrado, con su id')
  await deshacer(db)
  assert.equal((await db.tiposTrailer.get(id)).precioBase, 1000)
  await deshacer(db)
  assert.equal(await db.tiposTrailer.get(id), undefined)
  assert.equal(await deshacer(db), null, 'no hay más para deshacer')

  await rehacer(db)
  await rehacer(db)
  assert.equal((await db.tiposTrailer.get(id)).precioBase, 1500)
  await esperar()
  assert.equal((await db.historial.count()), 3, 'deshacer/rehacer no agrega pasos')
})

test('una acción de muchos registros es un solo paso', async () => {
  const a = await db.tiposTrailer.add({ nombre: 'A', claseId: 'trailers', precioBase: 100 })
  const b = await db.tiposTrailer.add({ nombre: 'B', claseId: 'trailers', precioBase: 200 })
  await esperar()
  await actualizarPreciosPorcentaje(10, [a, b]); await esperar()
  assert.equal((await db.historial.toArray()).at(-1).descripcion, 'Editó 2 tipos de producto')
  await deshacer(db)
  assert.deepEqual((await db.tiposTrailer.toArray()).map(t => t.precioBase), [100, 200])
})

test('deshacer la eliminación de una clase recupera la clase y su catálogo', async () => {
  const tipo = await db.tiposTrailer.add({ nombre: 'Caja chica', claseId: 'cajas', precioBase: 10 }); await esperar()
  await eliminarClase('cajas'); await esperar()
  assert.equal(await db.clasesProductos.get('cajas'), undefined)
  await deshacer(db)
  assert.equal((await db.clasesProductos.get('cajas')).nombre, 'Cajas')
  assert.equal((await db.tiposTrailer.get(tipo)).nombre, 'Caja chica')
})

test('un cambio nuevo descarta lo deshecho; volver a un punto deshace lo posterior', async () => {
  const id = await db.tiposTrailer.add({ nombre: 'Batea', claseId: 'trailers', precioBase: 1 }); await esperar()
  for (const precio of [2, 3, 4]) { await db.tiposTrailer.update(id, { precioBase: precio }); await esperar() }
  const [, dos] = await db.historial.toArray()
  await volverA(db, dos.id)
  assert.equal((await db.tiposTrailer.get(id)).precioBase, 2)
  await volverA(db, (await db.historial.toArray()).at(-1).id)
  assert.equal((await db.tiposTrailer.get(id)).precioBase, 4, 'también se puede ir hacia adelante')

  await volverA(db, dos.id)
  await db.tiposTrailer.update(id, { precioBase: 99 }); await esperar()
  assert.equal(await rehacer(db), null, 'ya no se puede rehacer lo descartado')
  assert.equal(await db.historial.count(), 3)
})

test('lo que llega de otro equipo no se registra, y deshacer se sincroniza como una edición', async () => {
  const id = await db.tiposTrailer.add({ nombre: 'Batea', claseId: 'trailers', precioBase: 1 }); await esperar()
  const remoto = structuredClone(await exportarEstado(db))
  remoto.tiposTrailer[0].precioBase = 50
  remoto.tiposTrailer[0].actualizado = Date.now() + 1000
  await aplicarEstado(db, remoto); await esperar()
  assert.equal(await db.historial.count(), 1)

  await db.tiposTrailer.update(id, { precioBase: 60 }); await esperar()
  const antes = (await db.tiposTrailer.get(id)).actualizado
  await new Promise(r => setTimeout(r, 5))
  await deshacer(db)
  const deshecho = await db.tiposTrailer.get(id)
  assert.equal(deshecho.precioBase, 50)
  assert.ok(deshecho.actualizado > antes, 'queda sellado para viajar a los otros equipos')
})

test('no pisa un registro que otro equipo cambió después, y lo avisa', async () => {
  const id = await db.tiposTrailer.add({ nombre: 'Batea', claseId: 'trailers', precioBase: 1 }); await esperar()
  await db.tiposTrailer.update(id, { precioBase: 2 }); await esperar()
  const remoto = structuredClone(await exportarEstado(db))
  remoto.tiposTrailer[0].precioBase = 3
  remoto.tiposTrailer[0].actualizado = Date.now() + 1000
  await aplicarEstado(db, remoto)

  const paso = await deshacer(db)
  assert.deepEqual(paso.omitidos, ['tipo de producto «Batea» (cambió después)'])
  assert.equal((await db.tiposTrailer.get(id)).precioBase, 3, 'queda el cambio del otro equipo')
})

test('un registro que choca con otro dato se saltea sin trabar el historial', async () => {
  const id = await db.categorias.add({ nombre: 'Frenos', claseId: 'trailers', esDescuento: false }); await esperar()
  await db.categorias.delete(id); await esperar()
  // Otro equipo crea una "Frenos" en la misma clase (no queda en el historial local).
  const remoto = structuredClone(await exportarEstado(db))
  remoto.categorias.push({ uid: 'uid-otro', nombre: 'Frenos', claseId: 'trailers', esDescuento: false, actualizado: Date.now() })
  await aplicarEstado(db, remoto)

  const paso = await deshacer(db)
  assert.deepEqual(paso.omitidos, ['categoría «Frenos» (ya existe otro con ese nombre)'])
  assert.equal(await db.categorias.count(), 1)
  assert.ok(await deshacer(db), 'se puede seguir deshaciendo lo anterior')
})

test('importar un backup no queda en el historial', async () => {
  await db.tiposTrailer.add({ nombre: 'Batea', claseId: 'trailers', precioBase: 1 }); await esperar()
  const backup = await exportarBackup()
  backup.tiposTrailer[0].nombre = 'Tanque'
  await db.historial.clear()
  await combinarBackup(await analizarBackup(backup), false); await esperar()
  assert.equal(await db.tiposTrailer.count(), 2)
  assert.equal(await db.historial.count(), 0)
})
