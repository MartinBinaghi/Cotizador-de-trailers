// Herramienta manual: no se importa desde la app ni forma parte del instalador.
import { writeFile } from 'node:fs/promises'
import { calcularPrecioConGanancia } from '../src/utils/calcularPrecio.js'

const clasesProductos = [
  { id: 'trailers', nombre: 'Trailers' }, { id: 'cajas', nombre: 'Cajas' },
  { id: 'universal', nombre: 'Universal' }, { id: 'prueba-carrocerias', nombre: 'PRUEBA Carrocerías' }
]
const tiposTrailer = [
  { id: 101, nombre: 'PRUEBA Trailer liviano', claseId: 'trailers', precioBase: 1000000, ganancia: 1 },
  { id: 102, nombre: 'PRUEBA Trailer reforzado', claseId: 'trailers', precioBase: 1500000, ganancia: 1.2 },
  { id: 103, nombre: 'PRUEBA Caja estándar', claseId: 'cajas', precioBase: 2000000, ganancia: 1 },
  { id: 104, nombre: 'PRUEBA Caja cerrada', claseId: 'cajas', precioBase: 2500000, ganancia: 1.2 },
  { id: 105, nombre: 'PRUEBA Plataforma compartida', claseId: 'universal', precioBase: 800000, ganancia: 1 },
  { id: 106, nombre: 'PRUEBA Carrocería de reparto', claseId: 'prueba-carrocerias', precioBase: 3000000, ganancia: 1 }
]
const categorias = [
  { id: 201, nombre: 'PRUEBA Accesorios', claseId: 'trailers', esDescuento: false },
  { id: 202, nombre: 'PRUEBA Ejes y frenos', claseId: 'trailers', esDescuento: false },
  { id: 203, nombre: 'PRUEBA Homologación', claseId: 'trailers', esDescuento: false },
  { id: 204, nombre: 'PRUEBA Accesorios', claseId: 'cajas', esDescuento: false },
  { id: 205, nombre: 'PRUEBA Estructura', claseId: 'cajas', esDescuento: false },
  { id: 206, nombre: 'PRUEBA Terminación', claseId: 'cajas', esDescuento: false },
  { id: 207, nombre: 'PRUEBA Pintura', claseId: 'universal', esDescuento: false },
  { id: 208, nombre: 'PRUEBA Descuentos', claseId: 'universal', esDescuento: true },
  { id: 209, nombre: 'PRUEBA Servicios', claseId: 'universal', esDescuento: false },
  { id: 210, nombre: 'PRUEBA Equipamiento', claseId: 'prueba-carrocerias', esDescuento: false }
]
const variables = []
function variable(id, categoriaId, nombre, valor, extras = {}) {
  const cat = categorias.find(c => c.id === categoriaId)
  variables.push({ id, categoriaId, categoria: cat.nombre, claseId: cat.claseId, nombre: `PRUEBA ${nombre}`,
    valor, tipoModificador: 'fijo', aplicaSobre: 'base', ganancia: 1, permiteCantidad: false, esOpcional: false, ...extras })
}
variable(301, 201, 'Luz LED', 10000, { permiteCantidad: true, esOpcional: true })
variable(302, 201, 'Rueda de auxilio', 80000, { esOpcional: true })
variable(303, 202, 'Eje reforzado', 150000)
variable(304, 202, 'Freno por rueda', 50000, { permiteCantidad: true })
variable(305, 203, 'Homologación', 10, { tipoModificador: 'porcentual' })
variable(306, 204, 'Luz LED', 25000, { permiteCantidad: true, esOpcional: true })
variable(307, 204, 'Cajón de herramientas', 100000, { esOpcional: true })
variable(308, 205, 'Piso reforzado', 200000)
variable(309, 205, 'Baranda desmontable', 75000, { permiteCantidad: true, esOpcional: true })
variable(310, 206, 'Terminación premium', 5, { tipoModificador: 'porcentual', aplicaSobre: 'subtotal' })
variable(311, 207, 'Pintura negra', 50000)
variable(312, 207, 'Pintura especial', 90000, { esOpcional: true })
variable(313, 208, 'Pago de contado', -5, { tipoModificador: 'porcentual', aplicaSobre: 'subtotal' })
variable(314, 208, 'Descuento comercial', -10, { tipoModificador: 'porcentual', aplicaSobre: 'subtotal' })
variable(315, 209, 'Entrega local', 30000, { esOpcional: true })
variable(316, 209, 'Servicio de montaje', 60000)
variable(317, 210, 'Estante interior', 40000, { permiteCantidad: true, esOpcional: true })
variable(318, 210, 'Aislación interior', 250000)
// Categoría compartida con variables exclusivas: no deben cruzarse de clase.
variable(319, 209, 'Montaje exclusivo cajas', 45000, { claseId: 'cajas' })
variable(320, 209, 'Montaje exclusivo trailers', 35000, { claseId: 'trailers' })

function cotizacion(id, tipoId, seleccion, cliente, dia) {
  const tipo = tiposTrailer.find(t => t.id === tipoId)
  const seleccionadas = variables.filter(v => seleccion[v.id]).map(v => ({ ...v, cantidad: seleccion[v.id] }))
  const { valor } = calcularPrecioConGanancia(tipo, seleccionadas, 1)
  return {
    id, tipoTrailerId: tipo.id, claseId: tipo.claseId,
    variablesSeleccionadas: seleccionadas.map(v => ({ id: v.id, cantidad: v.cantidad })), precioFinal: valor.precioFinal,
    cliente: { nombreCliente: `PRUEBA ${cliente}`, razonSocial: 'Cliente ficticio para pruebas', cuit: '' },
    fecha: `2026-09-0${dia}T15:00:00.000Z`, imagenes: [], observaciones: 'DATOS FICTICIOS. Cotización de prueba, sin validez comercial.',
    snapshot: { tipoTrailerNombre: tipo.nombre, base: valor.base,
      detalle: valor.detalle.map(d => ({ ...d, cantidad: seleccion[d.id] ?? 1 })) }
  }
}
const cotizaciones = [
  cotizacion(401, 101, { 301: 2, 304: 2, 311: 1, 313: 1 }, 'Cliente trailer', 1),
  cotizacion(402, 103, { 306: 2, 308: 1, 311: 1, 313: 1 }, 'Cliente caja', 2),
  cotizacion(403, 106, { 317: 3, 318: 1, 311: 1 }, 'Cliente carrocería', 3)
]
const data = {
  version: 2, fechaExportacion: '2026-09-05T15:00:00.000Z',
  nota: 'PRUEBA-CLASES-2026: datos ficticios, importación manual exclusivamente.',
  clasesProductos, tiposTrailer, categorias, variables, cotizaciones, config: []
}
await writeFile(new URL('./clases-productos.json', import.meta.url), JSON.stringify(data, null, 2) + '\n', 'utf8')
console.log(JSON.stringify({ tipos: tiposTrailer.length, categorias: categorias.length, variables: variables.length,
  cotizaciones: cotizaciones.map(c => ({ cliente: c.cliente.nombreCliente, total: c.precioFinal })) }, null, 2))
