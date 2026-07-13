/**
 * Las cotizaciones guardan las variables elegidas como { [variableId]: cantidad }
 * en la UI, pero persistidas en IndexedDB como array de { id, cantidad }.
 * Las cotizaciones guardadas antes de agregar "cantidad" tienen un array
 * plano de ids (number[]) — se siguen aceptando para no romper el historial viejo.
 */
export function normalizarSeleccionadas(seleccionadas) {
  if (!seleccionadas) return {}
  if (Array.isArray(seleccionadas)) {
    const mapa = {}
    for (const item of seleccionadas) {
      if (typeof item === 'number') {
        mapa[item] = 1
      } else if (item && typeof item === 'object') {
        mapa[item.id] = item.cantidad ?? 1
      }
    }
    return mapa
  }
  return seleccionadas
}

/** Convierte el mapa { [id]: cantidad } al formato que se persiste en la base. */
export function serializarSeleccionadas(seleccionadas) {
  return Object.entries(seleccionadas).map(([id, cantidad]) => ({ id: Number(id), cantidad }))
}

/** Cruza el mapa de selección con el catálogo de variables para tener objetos completos con cantidad. */
export function variablesDesdeSeleccion(variables, seleccionadas) {
  return variables
    .filter(v => Object.prototype.hasOwnProperty.call(seleccionadas, v.id))
    .map(v => ({ ...v, cantidad: seleccionadas[v.id] ?? 1 }))
}
