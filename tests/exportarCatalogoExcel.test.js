import { test } from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import { generarCatalogoExcel } from '../src/utils/exportarCatalogoExcel.js'

test('exporta todo el catálogo con tipos numéricos y referencias de clase y categoría', async () => {
  const datos = {
    clasesProductos: [{ id: 'trailers', nombre: 'Trailers' }, { id: 'cajas', nombre: 'Cajas' }, { id: 'universal', nombre: 'Universal' }],
    tiposTrailer: [{ id: 1, claseId: 'trailers', nombre: 'Trailer', precioBase: 1234.5, ganancia: 1.2 },
      { id: 2, claseId: 'cajas', nombre: 'Caja', precioBase: 3456, ganancia: 1 }],
    categorias: [{ id: 10, claseId: 'trailers', nombre: 'Accesorios', esDescuento: false },
      { id: 11, claseId: 'cajas', nombre: 'Accesorios', esDescuento: false },
      { id: 12, claseId: 'universal', nombre: 'Descuentos', esDescuento: true }],
    variables: [{ id: 21, claseId: 'cajas', categoriaId: 11, categoria: 'Accesorios', nombre: 'Luz LED', valor: 150.25,
      tipoModificador: 'fijo', aplicaSobre: 'base', ganancia: 1.5, permiteCantidad: true, esOpcional: true },
    { id: 22, claseId: 'universal', categoriaId: 12, categoria: 'Descuentos', nombre: '=1+1', valor: -5,
      tipoModificador: 'porcentual', aplicaSobre: 'subtotal', ganancia: 1, permiteCantidad: false, esOpcional: false }]
  }
  const original = structuredClone(datos)
  const bytes = await generarCatalogoExcel(datos)
  const libro = new ExcelJS.Workbook()
  await libro.xlsx.load(bytes)
  assert.deepEqual(libro.worksheets.map(h => h.name), ['Clases', 'Tipos de producto', 'Categorías', 'Variables'])
  assert.equal(libro.getWorksheet('Tipos de producto').rowCount, 3)
  assert.equal(libro.getWorksheet('Categorías').rowCount, 4)
  const hoja = libro.getWorksheet('Variables')
  assert.equal(hoja.getCell('E2').value, 'Accesorios')
  assert.equal(hoja.getCell('F2').value, 11)
  assert.equal(hoja.getCell('G2').value, 'Cajas')
  assert.equal(hoja.getCell('I2').value, 150.25)
  assert.equal(hoja.getCell('K2').value, 1.5)
  assert.equal(hoja.getCell('L2').value, 'Sí')
  assert.equal(hoja.getCell('B3').value, '=1+1')
  assert.equal(hoja.getCell('B3').type, ExcelJS.ValueType.String)
  assert.equal(hoja.getCell('I3').value, -5)
  assert.equal(hoja.getCell('I3').numFmt, '0.##"%"')
  assert.equal(hoja.views[0].ySplit, 1)
  assert.ok(hoja.autoFilter)
  assert.deepEqual(datos, original)
})

test('un catálogo vacío produce un libro válido con los encabezados', async () => {
  const bytes = await generarCatalogoExcel({ clasesProductos: [], tiposTrailer: [], categorias: [], variables: [] })
  const libro = new ExcelJS.Workbook()
  await libro.xlsx.load(bytes)
  assert.equal(libro.worksheets.length, 4)
  for (const hoja of libro.worksheets) assert.equal(hoja.rowCount, 1)
})
