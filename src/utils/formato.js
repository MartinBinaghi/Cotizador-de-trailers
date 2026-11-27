/** Fecha y hora cortas (ej: 27/11/26, 11:47). */
export const fechaHora = fecha => new Date(fecha).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })

export const formatoARS = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0
})

// Nota aclaratoria: el precio final cotizado no incluye IVA.
export const NOTA_IVA = '+IVA (10,5%)'
