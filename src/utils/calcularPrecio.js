/**
 * Calcula el precio final a partir de un tipo de trailer y las variables elegidas.
 *
 * Regla aplicada (ajustable según lo que defina el cliente):
 * 1. Se parte del precioBase del tipo de trailer.
 * 2. Se suman todos los modificadores "fijo" -> arma el subtotal.
 * 3. Se aplican los modificadores "porcentual" sobre 'base' o sobre 'subtotal'
 *    según lo que tenga configurado cada variable.
 *
 * Las variables fijas que admiten cantidad (ej: frenos, llantas, cubiertas)
 * traen un campo `cantidad` (por defecto 1) que multiplica su aporte al precio.
 * En las porcentuales la cantidad se ignora (un "+15%" no se multiplica).
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
    const monto = (sobre * Number(v.valor || 0)) / 100
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

/**
 * Igual que calcularPrecio, pero aplica el multiplicador de "ganancia" del
 * tipo de trailer y de cada variable de monto fijo. Devuelve el costo
 * (calcularPrecio sin modificar) y el valor: el precio que se cobra al
 * cliente, con margen ya incorporado. `valor` tiene la misma forma que el
 * retorno de calcularPrecio, para poder usarse en su lugar donde se
 * guarda/imprime el precio final.
 *
 * El valor se calcula corriendo calcularPrecio sobre los precios ya
 * multiplicados por su ganancia: así las variables porcentuales aplican su %
 * sobre la base/subtotal que ve el cliente (un "+15%" cobra exactamente 15%
 * del precio a la vista). La ganancia propia de una variable porcentual se
 * ignora: solo tiene sentido en montos fijos.
 *
 * @param {{precioBase: number, ganancia?: number}} tipoTrailer
 * @param {Array<{id: number, valor: number, ganancia?: number}>} variables
 * @param {number} redondeo
 * @returns {{ costo: object, valor: { base: number, precioFinal: number, detalle: Array } }}
 */
export function calcularPrecioConGanancia(tipoTrailer, variables = [], redondeo = 1) {
  const costo = calcularPrecio(tipoTrailer, variables, redondeo)

  const gananciaTipo = Number(tipoTrailer?.ganancia) || 1
  const tipoConGanancia = { ...tipoTrailer, precioBase: (tipoTrailer?.precioBase ?? 0) * gananciaTipo }
  const variablesConGanancia = variables.map(v =>
    v.tipoModificador === 'fijo'
      ? { ...v, valor: Number(v.valor || 0) * (Number(v.ganancia) || 1) }
      : v
  )
  const valor = calcularPrecio(tipoConGanancia, variablesConGanancia, redondeo)

  return { costo, valor }
}

/**
 * Separa un resultado (de calcularPrecio o del `valor` de calcularPrecioConGanancia)
 * en precio estándar (base + variables no opcionales) y total de adicionales opcionales.
 * @param {{base: number, detalle: Array<{monto: number, esOpcional: boolean}>}} resultado
 * @returns {{precioEstandar: number, totalOpcionales: number}}
 */
export function desglosarEstandarYOpcionales(resultado) {
  const totalOpcionales = resultado.detalle
    .filter(d => d.esOpcional)
    .reduce((acc, d) => acc + d.monto, 0)
  const precioEstandar = resultado.base + resultado.detalle
    .filter(d => !d.esOpcional)
    .reduce((acc, d) => acc + d.monto, 0)
  return { precioEstandar, totalOpcionales }
}
