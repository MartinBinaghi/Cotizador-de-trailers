/**
 * Valida los campos de un tipo de trailer.
 * @returns {string|null} mensaje de error, o null si es válido
 */
export function validarTipoTrailer({ nombre, precioBase }) {
  if (!nombre || !nombre.trim()) return 'El nombre es obligatorio.'
  if (precioBase === '' || precioBase === null || precioBase === undefined) {
    return 'El precio base es obligatorio.'
  }
  const num = Number(precioBase)
  if (Number.isNaN(num)) return 'El precio base debe ser un número.'
  if (num < 0) return 'El precio base no puede ser negativo.'
  return null
}

/**
 * Valida los campos de una variable.
 */
export function validarVariable({ categoria, nombre, valor, tipoModificador }) {
  if (!categoria || !categoria.trim()) return 'La categoría es obligatoria.'
  if (!nombre || !nombre.trim()) return 'El nombre es obligatorio.'
  if (valor === '' || valor === null || valor === undefined) return 'El valor es obligatorio.'
  const num = Number(valor)
  if (Number.isNaN(num)) return 'El valor debe ser un número.'
  // Variables 'fijo' no pueden ser negativas, pero 'porcentual' sí (para descuentos)
  if (tipoModificador === 'fijo' && num < 0) return 'El valor fijo no puede ser negativo.'
  if (tipoModificador === 'porcentual' && num < 0 && !categoria.toLowerCase().includes('descuento')) {
    return 'Los porcentajes negativos solo se permiten en categorías de descuento.'
  }
  if (tipoModificador === 'porcentual' && Math.abs(num) > 1000) {
    return 'Ese porcentaje parece demasiado alto en valor absoluto, revisá el valor.'
  }
  return null
}
