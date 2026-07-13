/**
 * Calcula el precio final a partir de un tipo de trailer y las variables elegidas.
 *
 * Regla aplicada (ajustable según lo que defina el cliente):
 * 1. Se parte del precioBase del tipo de trailer.
 * 2. Se suman todos los modificadores "fijo" -> arma el subtotal.
 * 3. Se aplican los modificadores "porcentual" sobre 'base' o sobre 'subtotal'
 *    según lo que tenga configurado cada variable.
 *
 * Las variables que admiten cantidad (ej: frenos, llantas, cubiertas) traen
 * un campo `cantidad` (por defecto 1) que multiplica su aporte al precio.
 *
 * @param {{precioBase: number}} tipoTrailer
 * @param {Array<{tipoModificador: 'fijo'|'porcentual', valor: number, aplicaSobre: 'base'|'subtotal', cantidad?: number}>} variables
 * @param {number} redondeo múltiplo al que redondear el precio final (1 = sin redondeo, 100, 1000, etc.)
 * @returns {{ base: number, fijos: number, porcentuales: number, precioFinal: number, detalle: Array<{id: number, nombre: string, monto: number, esOpcional: boolean}> }}
 */
export function calcularPrecio(tipoTrailer, variables = [], redondeo = 1) {
  const base = tipoTrailer?.precioBase ?? 0

  const detalle = []

  const fijos = variables
    .filter(v => v.tipoModificador === 'fijo')
    .reduce((acc, v) => {
      const monto = Number(v.valor || 0) * (Number(v.cantidad) || 1)
      detalle.push({ id: v.id, nombre: v.nombre, monto, esOpcional: !!v.esOpcional })
      return acc + monto
    }, 0)

  const subtotal = base + fijos

  let porcentuales = 0

  for (const v of variables) {
    if (v.tipoModificador !== 'porcentual') continue
    const sobre = v.aplicaSobre === 'base' ? base : subtotal
    const monto = ((sobre * Number(v.valor || 0)) / 100) * (Number(v.cantidad) || 1)
    porcentuales += monto
    detalle.push({ id: v.id, nombre: v.nombre, monto, esOpcional: !!v.esOpcional })
  }

  const precioFinal = subtotal + porcentuales
  const mult = redondeo && redondeo > 1 ? redondeo : 1
  const precioFinalRedondeado = Math.round(precioFinal / mult) * mult

  return {
    base,
    fijos,
    porcentuales,
    precioFinal: precioFinalRedondeado,
    detalle
  }
}
