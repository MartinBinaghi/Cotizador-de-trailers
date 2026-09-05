import { claseDe, nombreClase } from './clasesProductos.js'

const formatoImporte = '#,##0.00'
const siNo = valor => valor ? 'Sí' : 'No'

// ExcelJS se carga al exportar, no durante el arranque de la aplicación.
export async function generarCatalogoExcel({ clasesProductos, tiposTrailer, categorias, variables }) {
  const { default: ExcelJS } = await import('exceljs')
  const libro = new ExcelJS.Workbook()
  libro.creator = 'BINA Maquinarias'
  libro.title = 'Catálogo completo de productos'
  libro.created = new Date()
  const clases = [...clasesProductos].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  const porCategoria = new Map(categorias.map(c => [c.id, c]))
  const clase = item => nombreClase(clases, claseDe(item))
  const ordenar = items => [...items].sort((a, b) =>
    clase(a).localeCompare(clase(b), 'es') || a.nombre.localeCompare(b.nombre, 'es'))

  function hoja(nombre, columnas, filas) {
    const hoja = libro.addWorksheet(nombre, { views: [{ state: 'frozen', ySplit: 1 }] })
    hoja.columns = columnas.map(([header, width, numFmt]) => ({ header, width, style: numFmt ? { numFmt } : {} }))
    // Los textos se escriben como cadenas: nombres que comienzan con '=' no
    // se convierten en fórmulas ni vínculos ejecutables.
    hoja.addRows(filas)
    hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, hoja.rowCount), column: columnas.length } }
    hoja.getRow(1).height = 32
    hoja.getRow(1).eachCell(celda => {
      celda.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF29251A' } }
      celda.alignment = { vertical: 'middle', wrapText: true }
    })
    hoja.eachRow((fila, numero) => {
      if (numero === 1) return
      fila.alignment = { vertical: 'top', wrapText: true }
      if (numero % 2 === 0) fila.eachCell(celda => {
        celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7F4E9' } }
      })
    })
    return hoja
  }

  hoja('Clases', [['ID de clase', 38], ['Nombre', 30]], clases.map(c => [c.id, c.nombre]))
  hoja('Tipos de producto', [
    ['ID', 10], ['Nombre', 38], ['Clase', 26], ['ID de clase', 38],
    ['Precio base ($)', 20, formatoImporte], ['Ganancia (factor)', 19, '0.00']
  ], ordenar(tiposTrailer).map(t => [t.id, t.nombre, clase(t), claseDe(t), t.precioBase, t.ganancia ?? 1]))
  hoja('Categorías', [
    ['ID', 10], ['Nombre', 32], ['Clase', 26], ['ID de clase', 38], ['Es descuento', 18]
  ], ordenar(categorias).map(c => [c.id, c.nombre, clase(c), claseDe(c), siNo(c.esDescuento)]))
  const hojaVariables = hoja('Variables', [
    ['ID', 10], ['Nombre', 36], ['Clase', 25], ['ID de clase', 38], ['Categoría', 30],
    ['ID de categoría', 17], ['Clase de categoría', 25], ['Modificador', 19],
    ['Valor ($ o %)', 19, formatoImporte], ['Aplicar % sobre', 20],
    ['Ganancia (factor)', 19, '0.00'], ['Permite cantidad', 19], ['Es opcional', 16]
  ], ordenar(variables).map(v => {
    const categoria = porCategoria.get(v.categoriaId)
    return [v.id, v.nombre, clase(v), claseDe(v), categoria?.nombre ?? v.categoria,
      v.categoriaId ?? '', categoria ? clase(categoria) : '',
      v.tipoModificador === 'porcentual' ? 'Porcentaje' : 'Monto fijo', v.valor,
      v.aplicaSobre === 'subtotal' ? 'Subtotal' : 'Base', v.ganancia ?? 1,
      siNo(v.permiteCantidad), siNo(v.esOpcional)]
  }))
  for (let fila = 2; fila <= hojaVariables.rowCount; fila++) {
    if (hojaVariables.getCell(fila, 8).value === 'Porcentaje') {
      // El modelo guarda 5 para 5%, no 0,05. El signo % es literal.
      hojaVariables.getCell(fila, 9).numFmt = '0.##"%"'
    }
  }
  return new Uint8Array(await libro.xlsx.writeBuffer())
}
