export const OPCIONES_ORDEN = [
  ['nombre-asc', 'Nombre (A-Z)'],
  ['nombre-desc', 'Nombre (Z-A)'],
  ['precio-asc', 'Precio (menor a mayor)'],
  ['precio-desc', 'Precio (mayor a menor)']
]

// Precio = precioBase en tipos de producto, valor en variables. Lo que no
// tiene precio (categorías) cae al orden por nombre.
const precio = item => item.precioBase ?? item.valor ?? 0

export function compararPor(criterio = 'nombre-asc') {
  const [campo, direccion] = criterio.split('-')
  const signo = direccion === 'desc' ? -1 : 1
  return (a, b) => {
    const porNombre = a.nombre.localeCompare(b.nombre, 'es')
    if (campo === 'precio') return signo * (precio(a) - precio(b)) || porNombre
    return signo * porNombre
  }
}

export function ordenar(items, criterio) {
  return [...items].sort(compararPor(criterio))
}
