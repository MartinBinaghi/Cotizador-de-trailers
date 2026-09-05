export const CLASE_TRAILERS = 'trailers'
export const CLASE_UNIVERSAL = 'universal'
export const CLASES_INICIALES = [
  { id: CLASE_TRAILERS, nombre: 'Trailers' },
  { id: 'cajas', nombre: 'Cajas' },
  { id: CLASE_UNIVERSAL, nombre: 'Universal' }
]

export const normalizarNombre = valor => String(valor ?? '').trim().toLocaleLowerCase('es')
export const claseDe = item => item.claseId ?? CLASE_TRAILERS
export const perteneceAClase = (item, claseId) => claseDe(item) === claseId || claseDe(item) === CLASE_UNIVERSAL
export const nombreClase = (clases, claseId) => clases.find(c => c.id === claseId)?.nombre ?? 'Clase desconocida'

export function validarClaseCategoria(variable, categoria) {
  if (!categoria) return 'Seleccioná una categoría.'
  if (perteneceAClase(categoria, claseDe(variable))) return null
  return claseDe(variable) === CLASE_UNIVERSAL
    ? 'Una variable Universal debe pertenecer a una categoría Universal.'
    : 'La categoría debe ser de la misma clase que la variable o Universal.'
}

export function seleccionVisible(seleccionadas, variables) {
  const ids = new Set(variables.map(v => String(v.id)))
  return Object.fromEntries(Object.entries(seleccionadas).filter(([id]) => ids.has(id)))
}
