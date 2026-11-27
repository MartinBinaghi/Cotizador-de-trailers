import 'fake-indexeddb/auto'
import { test, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '../src/db/database.js'
import { guardarCategoria, guardarVariable } from '../src/db/catalogo.js'
import { calcularPrecio, desglosarEstandarYOpcionales } from '../src/utils/calcularPrecio.js'

beforeEach(async () => { await db.delete(); await db.open() })
after(async () => { await db.delete() })

const variable = { claseId: 'trailers', tipoModificador: 'fijo', aplicaSobre: 'base' }

test('un descuento de monto fijo se carga en positivo y resta del precio', async () => {
  const descuentos = await guardarCategoria({ nombre: 'Descuentos', claseId: 'trailers', esDescuento: true })
  const id = await guardarVariable({ ...variable, nombre: 'Bonificación', valor: 50000, categoriaId: descuentos })
  const guardada = await db.variables.get(id)
  assert.equal(guardada.valor, -50000)
  assert.equal(calcularPrecio({ precioBase: 1000000 }, [guardada]).precioFinal, 950000)

  const extras = await guardarCategoria({ nombre: 'Extras', claseId: 'trailers' })
  await assert.rejects(guardarVariable({ ...variable, nombre: 'Malo', valor: -5, categoriaId: extras }), /no puede ser negativo/)
})

test('marcar o desmarcar "descuento" cambia el signo de sus variables; renombrar no', async () => {
  const categoriaId = await guardarCategoria({ nombre: 'Recargos', claseId: 'trailers' })
  const pct = await guardarVariable({ ...variable, tipoModificador: 'porcentual', nombre: 'Urgencia', valor: 10, categoriaId })
  const fijo = await guardarVariable({ ...variable, nombre: 'Flete', valor: 300, categoriaId })

  await guardarCategoria({ id: categoriaId, nombre: 'Recargos varios', claseId: 'trailers' })
  assert.equal((await db.variables.get(pct)).valor, 10)

  await guardarCategoria({ id: categoriaId, nombre: 'Descuentos', claseId: 'trailers', esDescuento: true })
  assert.equal((await db.variables.get(pct)).valor, -10)
  assert.equal((await db.variables.get(fijo)).valor, -300)

  // Editar la variable (mostrada en positivo en el formulario) no le vuelve a cambiar el signo.
  await guardarVariable({ ...variable, id: pct, tipoModificador: 'porcentual', nombre: 'Pronto pago', valor: 10, categoriaId })
  assert.equal((await db.variables.get(pct)).valor, -10)

  await guardarCategoria({ id: categoriaId, nombre: 'Descuentos', claseId: 'trailers', esDescuento: false })
  assert.equal((await db.variables.get(pct)).valor, 10)
})

test('con redondeo, precio estándar + opcionales suma exactamente el total', () => {
  const resultado = calcularPrecio({ precioBase: 8734500 }, [
    { id: 1, tipoModificador: 'fijo', valor: 12345, esOpcional: true },
    { id: 2, tipoModificador: 'porcentual', valor: 3, aplicaSobre: 'subtotal' }
  ], 10000)
  const { precioEstandar, totalOpcionales } = desglosarEstandarYOpcionales(resultado)
  assert.equal(totalOpcionales, 12345)
  assert.equal(precioEstandar + totalOpcionales, resultado.precioFinal)
  assert.equal(resultado.precioFinal % 10000, 0)
})
