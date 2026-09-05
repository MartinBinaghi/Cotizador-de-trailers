import 'fake-indexeddb/auto'
import { test, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { db, guardarBorrador, seedIfEmpty, exportarBackup, analizarBackup, combinarBackup } from '../src/db/database.js'
import { eliminarClase, resumirClase } from '../src/db/eliminarClase.js'

beforeEach(async () => {
  await db.delete()
  await db.open()
  await db.tiposTrailer.bulkAdd([{ id: 1, nombre: 'Trailer', claseId: 'trailers', precioBase: 100 },
    { id: 2, nombre: 'Caja', claseId: 'cajas', precioBase: 200 }])
  await db.categorias.bulkAdd([{ id: 1, nombre: 'Accesorios', claseId: 'trailers' },
    { id: 2, nombre: 'Comunes', claseId: 'universal' }])
  await db.variables.bulkAdd([
    { id: 1, nombre: 'Eje', claseId: 'trailers', categoriaId: 1, categoria: 'Accesorios', tipoModificador: 'fijo', valor: 10 },
    { id: 2, nombre: 'Montaje trailer', claseId: 'trailers', categoriaId: 2, categoria: 'Comunes', tipoModificador: 'fijo', valor: 20 },
    { id: 3, nombre: 'Pintura', claseId: 'universal', categoriaId: 2, categoria: 'Comunes', tipoModificador: 'fijo', valor: 30 }
  ])
})
after(async () => { await db.delete() })

test('Universal está protegida también en la capa de datos', async () => {
  await assert.rejects(eliminarClase('universal'), /no se puede eliminar/)
  assert.equal(await db.clasesProductos.count(), 3)
  assert.equal(await db.variables.count(), 3)
})

test('elimina solo los datos propios y conserva historial, universales y otras pantallas', async () => {
  await db.cotizaciones.add({ id: 1, claseId: 'trailers', tipoTrailerId: 1, precioFinal: 140,
    variablesSeleccionadas: [1, 3], fecha: '2026-09-05', cliente: {} })
  await db.config.bulkPut([
    { clave: 'claseSeleccionada:cotizador', valor: 'trailers' },
    { clave: 'claseSeleccionada:catalogo', valor: 'trailers' },
    { clave: 'claseSeleccionada:comparativa', valor: 'cajas' },
    { clave: 'borradorCotizador', valor: { claseId: 'trailers', nombreCliente: 'Borrador' } },
    { clave: 'borradorComparativa', valor: { claseId: 'cajas', nombreCliente: 'Conservar' } }
  ])
  assert.deepEqual(await resumirClase('trailers'), { tipos: 1, categorias: 1, variables: 2 })
  await eliminarClase('trailers')
  assert.equal(await db.clasesProductos.get('trailers'), undefined)
  assert.deepEqual((await db.tiposTrailer.toArray()).map(t => t.id), [2])
  assert.deepEqual((await db.categorias.toArray()).map(c => c.id), [2])
  assert.deepEqual((await db.variables.toArray()).map(v => v.id), [3])
  assert.equal((await db.config.get('claseSeleccionada:catalogo')).valor, 'universal')
  assert.equal((await db.config.get('claseSeleccionada:comparativa')).valor, 'cajas')
  assert.equal(await db.config.get('borradorCotizador'), undefined)
  assert.equal((await db.config.get('borradorComparativa')).valor.nombreCliente, 'Conservar')
  await guardarBorrador('cotizador', 'borradorCotizador', 'trailers', { nombreCliente: 'Tardío' })
  assert.equal(await db.config.get('borradorCotizador'), undefined)
  const historica = await db.cotizaciones.get(1)
  assert.equal(historica.claseNombre, 'Trailers')
  assert.equal(historica.precioFinal, 140)
  assert.equal(historica.snapshot.tipoTrailerNombre, 'Trailer')
  assert.equal(historica.snapshot.detalle.length, 2)
  // Un backup propio debe seguir siendo importable tras eliminar la clase.
  await combinarBackup(await analizarBackup(await exportarBackup()), true)
  assert.equal((await db.cotizaciones.get(1)).claseEliminada, true)
  assert.equal(await db.clasesProductos.get('trailers'), undefined)
})

test('se pueden eliminar todas las clases salvo Universal sin que el seed las reviva', async () => {
  await eliminarClase('trailers')
  await eliminarClase('cajas')
  await seedIfEmpty()
  assert.deepEqual((await db.clasesProductos.toArray()).map(c => c.id), ['universal'])
  assert.equal(await db.tiposTrailer.count(), 0)
})

test('un backup antiguo puede recuperar Trailers después de eliminarla', async () => {
  await eliminarClase('trailers')
  const analisis = await analizarBackup({ version: 1, tiposTrailer: [{ id: 10, nombre: 'Restaurado', precioBase: 400 }], variables: [] })
  await combinarBackup(analisis, false)
  assert.equal((await db.clasesProductos.get('trailers')).nombre, 'Trailers')
  assert.equal((await db.tiposTrailer.filter(t => t.nombre === 'Restaurado').first()).claseId, 'trailers')
})
