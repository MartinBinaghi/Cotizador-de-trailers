import { formatoARS, NOTA_IVA } from './formato'
import logoUrl from '../../BINA MAQUINARIAS LOGO_2026_Mesa de trabajo 1 copia.png'

// Paleta consistente con la UI (App.css): header oscuro, acento celeste, grises slate.
const COLOR_HEADER = [30, 41, 59]
const COLOR_ACENTO = [56, 189, 248]
const COLOR_TEXTO = [51, 65, 85]
const COLOR_MUTED = [100, 116, 139]
const COLOR_BORDE = [226, 232, 240]
const COLOR_FONDO_SUAVE = [248, 250, 252]

// Banner superior: negro + amarillo, colores de marca (logo BINA Maquinarias).
const COLOR_BANNER_NEGRO = [0, 0, 0]
const COLOR_BANNER_AMARILLO = [255, 204, 0]
const ALTO_BANNER = 24

const MARGEN = 14

function formatoFechaArchivo(fechaIso) {
  const fecha = new Date(fechaIso)
  const pad = n => String(n).padStart(2, '0')
  return `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}`
}

// El logo se carga una sola vez (como data URL) y se reutiliza en todos los PDFs generados en la sesión.
let logoDataUrlPromise = null
function cargarLogoDataUrl() {
  if (!logoDataUrlPromise) {
    logoDataUrlPromise = fetch(logoUrl)
      .then(res => res.blob())
      .then(blob => new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => reject(new Error('No se pudo cargar el logo'))
        reader.readAsDataURL(blob)
      }))
      .catch(() => null)
  }
  return logoDataUrlPromise
}

/** Banner con diagonal a 45°: mitad izquierda negra (con el logo) y mitad derecha amarilla. */
function dibujarEncabezado(doc, logoDataUrl) {
  const anchoPagina = doc.internal.pageSize.getWidth()
  const mitad = ALTO_BANNER / 2
  const centroX = anchoPagina / 2

  doc.setFillColor(...COLOR_BANNER_NEGRO)
  doc.rect(0, 0, anchoPagina, ALTO_BANNER, 'F')

  doc.setFillColor(...COLOR_BANNER_AMARILLO)
  doc.lines(
    [
      [anchoPagina - (centroX - mitad), 0],
      [0, ALTO_BANNER],
      [(centroX + mitad) - anchoPagina, 0]
    ],
    centroX - mitad, 0,
    [1, 1],
    'F',
    true
  )

  if (logoDataUrl) {
    const props = doc.getImageProperties(logoDataUrl)
    const altoLogo = ALTO_BANNER - 8
    let anchoLogo = altoLogo * (props.width / props.height)
    const anchoMaxLogo = centroX - mitad - MARGEN
    if (anchoLogo > anchoMaxLogo) anchoLogo = anchoMaxLogo
    doc.addImage(logoDataUrl, props.fileType, MARGEN, (ALTO_BANNER - altoLogo) / 2, anchoLogo, altoLogo)
  }

  doc.setTextColor(...COLOR_TEXTO)
  return ALTO_BANNER
}

function dibujarPiePagina(doc, fecha) {
  const totalPaginas = doc.internal.getNumberOfPages()
  const anchoPagina = doc.internal.pageSize.getWidth()
  const altoPagina = doc.internal.pageSize.getHeight()
  const emitido = `Cotizador de Trailers · Emitido: ${new Date(fecha).toLocaleString('es-AR')}`
  for (let i = 1; i <= totalPaginas; i++) {
    doc.setPage(i)
    doc.setDrawColor(...COLOR_BORDE)
    doc.setLineWidth(0.2)
    doc.line(MARGEN, altoPagina - 14, anchoPagina - MARGEN, altoPagina - 14)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...COLOR_MUTED)
    doc.text(emitido, MARGEN, altoPagina - 8)
    doc.text(`Página ${i} de ${totalPaginas}`, anchoPagina - MARGEN, altoPagina - 8, { align: 'right' })
  }
}

function montoVariable(v, resultado) {
  const item = resultado.detalle?.find(d => d.id === v.id)
  return item ? item.monto : 0
}

/** Dibuja una sección titulada con una lista de variables (con o sin precio por fila). */
function dibujarSeccionVariables(doc, yInicial, anchoPagina, altoPagina, titulo, items, { mostrarPrecio, resultado, mensajeVacio, colorMarcador = COLOR_ACENTO }) {
  let y = yInicial
  doc.setFillColor(...colorMarcador)
  doc.rect(MARGEN, y - 3, 2.5, 2.5, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...COLOR_HEADER)
  doc.text(titulo, MARGEN + 5, y)
  y += 8

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)

  if (items.length === 0) {
    doc.setTextColor(...COLOR_MUTED)
    doc.text(mensajeVacio, MARGEN, y)
    y += 7
  } else {
    const alturaFila = 7
    for (const v of items) {
      if (y + alturaFila > altoPagina - 20) {
        doc.addPage()
        y = 20
      }
      const etiqueta = v.cantidad > 1 ? `${v.nombre} (x${v.cantidad})` : v.nombre
      doc.setTextColor(...COLOR_TEXTO)
      doc.text(etiqueta, MARGEN, y)
      if (mostrarPrecio) {
        doc.text(formatoARS.format(montoVariable(v, resultado)), anchoPagina - MARGEN, y, { align: 'right' })
      }
      doc.setDrawColor(...COLOR_BORDE)
      doc.setLineWidth(0.15)
      doc.line(MARGEN, y + 2.5, anchoPagina - MARGEN, y + 2.5)
      y += alturaFila
    }
    y += 4
  }
  return y
}

/** Calcula el ancho/alto (mm) de una imagen respetando su relación de aspecto, sin exceder altoMax ni anchoMax. */
function medidasImagen(doc, dataUrl, altoMax, anchoMax) {
  const props = doc.getImageProperties(dataUrl)
  const ratio = props.width / props.height
  let alto = altoMax
  let ancho = alto * ratio
  if (ancho > anchoMax) {
    ancho = anchoMax
    alto = ancho / ratio
  }
  return { ancho, alto, formato: props.fileType }
}

/**
 * Dibuja hasta 3 imágenes debajo del contenido del PDF: la primera (principal)
 * en tamaño mediano, y las siguientes a su derecha más chicas, sin superar
 * la altura de la principal.
 */
function dibujarImagenes(doc, yInicial, anchoPagina, altoPagina, imagenes) {
  const ALTO_PRINCIPAL = 60
  const GAP = 4
  const anchoDisponible = anchoPagina - MARGEN * 2

  let y = yInicial
  if (y + ALTO_PRINCIPAL + 14 > altoPagina - 20) {
    doc.addPage()
    y = 20
  }

  doc.setFillColor(...COLOR_ACENTO)
  doc.rect(MARGEN, y - 3, 2.5, 2.5, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...COLOR_HEADER)
  doc.text('Imágenes ilustrativas (solo de ejemplo)', MARGEN + 5, y)
  y += 8

  const [principal, ...secundarias] = imagenes
  const anchoMaxPrincipal = Math.min(anchoDisponible * 0.55, 100)
  const principalMedidas = medidasImagen(doc, principal, ALTO_PRINCIPAL, anchoMaxPrincipal)
  doc.addImage(principal, principalMedidas.formato, MARGEN, y, principalMedidas.ancho, principalMedidas.alto)

  if (secundarias.length > 0) {
    const xColumna = MARGEN + principalMedidas.ancho + GAP
    const anchoColumna = anchoPagina - MARGEN - xColumna
    const altoSecundaria = secundarias.length === 1
      ? principalMedidas.alto
      : (principalMedidas.alto - GAP) / 2
    let ySecundaria = y
    for (const imagen of secundarias) {
      const medidas = medidasImagen(doc, imagen, altoSecundaria, anchoColumna)
      doc.addImage(imagen, medidas.formato, xColumna, ySecundaria, medidas.ancho, medidas.alto)
      ySecundaria += altoSecundaria + GAP
    }
  }

  return y + principalMedidas.alto + 6
}

/**
 * Genera y descarga el PDF de una cotización individual.
 * jsPDF se carga de forma diferida (dynamic import) para no inflar el
 * bundle inicial de la app con una librería que no siempre se usa.
 * @param {{cliente: {nombreCliente?: string, razonSocial?: string, cuit?: string}, fecha: string, tipoTrailerNombre: string, variables: Array, resultado: object, imagenes?: string[]}} datos
 */
export async function generarPdfCotizacion(datos) {
  const { jsPDF } = await import('jspdf')
  const { cliente, fecha, tipoTrailerNombre, variables = [], resultado, imagenes = [] } = datos
  const nombreCliente = cliente?.nombreCliente?.trim() || 'Sin nombre'
  const razonSocial = cliente?.razonSocial?.trim() || ''
  const cuit = cliente?.cuit?.trim() || ''
  const variablesEstandar = variables.filter(v => !v.esOpcional)
  const variablesOpcionales = variables.filter(v => v.esOpcional)
  const totalOpcionales = variablesOpcionales.reduce((acc, v) => acc + montoVariable(v, resultado), 0)
  const precioEstandar = resultado.base + variablesEstandar.reduce((acc, v) => acc + montoVariable(v, resultado), 0)
  const doc = new jsPDF()
  const anchoPagina = doc.internal.pageSize.getWidth()
  const altoPagina = doc.internal.pageSize.getHeight()
  const logoDataUrl = await cargarLogoDataUrl()

  let y = dibujarEncabezado(doc, logoDataUrl)
  y += 18

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...COLOR_MUTED)
  doc.text('CLIENTE', MARGEN, y)
  doc.text('TIPO DE TRAILER', anchoPagina / 2, y)
  y += 6
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(...COLOR_TEXTO)
  doc.text(nombreCliente, MARGEN, y)
  doc.text(tipoTrailerNombre, anchoPagina / 2, y)

  if (razonSocial) {
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...COLOR_MUTED)
    doc.text(`Razón social: ${razonSocial}`, MARGEN, y)
  }
  if (cuit) {
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...COLOR_MUTED)
    doc.text(`CUIT: ${cuit}`, MARGEN, y)
  }

  y += 8
  doc.setDrawColor(...COLOR_BORDE)
  doc.setLineWidth(0.3)
  doc.line(MARGEN, y, anchoPagina - MARGEN, y)

  y += 10
  y = dibujarSeccionVariables(doc, y, anchoPagina, altoPagina, 'Configuración estándar', variablesEstandar, {
    mostrarPrecio: false,
    resultado,
    mensajeVacio: 'Sin componentes estándar aplicados.',
    colorMarcador: COLOR_BANNER_NEGRO
  })

  y += 6
  y = dibujarSeccionVariables(doc, y, anchoPagina, altoPagina, 'Añadidos opcionales', variablesOpcionales, {
    mostrarPrecio: true,
    resultado,
    mensajeVacio: 'Sin opcionales agregados.',
    colorMarcador: COLOR_BANNER_NEGRO
  })

  const altoCaja = 27
  if (y + altoCaja > altoPagina - 20) {
    doc.addPage()
    y = 20
  }
  y += 6
  doc.setFillColor(...COLOR_FONDO_SUAVE)
  doc.roundedRect(MARGEN, y, anchoPagina - MARGEN * 2, altoCaja, 2, 2, 'F')
  const yFinCaja = y + altoCaja
  let yCaja = y + 8
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...COLOR_TEXTO)
  doc.text('Precio estándar', MARGEN + 6, yCaja)
  doc.text(formatoARS.format(precioEstandar), anchoPagina - MARGEN - 6, yCaja, { align: 'right' })
  yCaja += 7
  doc.text('Adicionales opcionales', MARGEN + 6, yCaja)
  doc.text(formatoARS.format(totalOpcionales), anchoPagina - MARGEN - 6, yCaja, { align: 'right' })
  yCaja += 8
  doc.setDrawColor(...COLOR_BORDE)
  doc.setLineWidth(0.3)
  doc.line(MARGEN + 6, yCaja - 5, anchoPagina - MARGEN - 6, yCaja - 5)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(...COLOR_HEADER)
  doc.text('TOTAL', MARGEN + 6, yCaja)

  const xDerecha = anchoPagina - MARGEN - 6
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...COLOR_MUTED)
  doc.text(NOTA_IVA, xDerecha, yCaja, { align: 'right' })
  const anchoNota = doc.getTextWidth(NOTA_IVA)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(...COLOR_HEADER)
  doc.text(formatoARS.format(resultado.precioFinal), xDerecha - anchoNota - 2, yCaja, { align: 'right' })

  if (imagenes.length > 0) {
    dibujarImagenes(doc, yFinCaja + 10, anchoPagina, altoPagina, imagenes)
  }

  dibujarPiePagina(doc, fecha)

  const slugCliente = (cliente?.nombreCliente?.trim() || 'sin-nombre').replace(/\s+/g, '-')
  const nombreArchivo = `cotizacion-${slugCliente}-${formatoFechaArchivo(fecha)}.pdf`
  doc.save(nombreArchivo)
}

/**
 * Genera y descarga un PDF con varios modelos comparados lado a lado.
 * Las variables no opcionales (estándar) se muestran como Sí/No, sin precio.
 * Las variables opcionales muestran su precio, y se agrega una fila
 * "Total opcionales" por columna para que se vea la diferencia entre el
 * trailer estándar y lo que pidió el cliente.
 * @param {{fecha: string, variablesInfo: Array<{nombre: string, esOpcional: boolean}>, columnas: Array<{nombre: string, tipoTrailerNombre: string, precioEstandar: number, totalOpcionales: number, total: number, valoresVariables: {[nombre: string]: string}}>}} datos
 */
export async function generarPdfComparativa(datos) {
  const { jsPDF } = await import('jspdf')
  const { fecha, variablesInfo = [], columnas } = datos
  const doc = new jsPDF({ orientation: 'landscape' })
  const anchoPagina = doc.internal.pageSize.getWidth()
  const altoPagina = doc.internal.pageSize.getHeight()
  const logoDataUrl = await cargarLogoDataUrl()

  let y = dibujarEncabezado(doc, logoDataUrl)
  y += 14

  const anchoEtiqueta = 48
  const anchoDisponible = anchoPagina - MARGEN * 2 - anchoEtiqueta
  const anchoColumna = Math.max(30, anchoDisponible / columnas.length)

  const filas = [
    { etiqueta: 'Tipo de trailer', valor: c => c.tipoTrailerNombre },
    { etiqueta: 'Precio estándar', valor: c => formatoARS.format(c.precioEstandar) },
    ...variablesInfo.map(vi => ({ etiqueta: vi.nombre, valor: c => c.valoresVariables[vi.nombre] ?? '—' })),
    { etiqueta: 'Total opcionales', valor: c => formatoARS.format(c.totalOpcionales) },
    { etiqueta: 'TOTAL', valor: c => `${formatoARS.format(c.total)} ${NOTA_IVA}`, destacada: true }
  ]

  function dibujarEncabezadoColumnas(yInicio) {
    doc.setFillColor(...COLOR_FONDO_SUAVE)
    doc.rect(MARGEN, yInicio, anchoPagina - MARGEN * 2, 11, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...COLOR_HEADER)
    doc.text('Concepto', MARGEN + 2, yInicio + 7)
    columnas.forEach((c, i) => {
      const x = MARGEN + anchoEtiqueta + i * anchoColumna
      const lineas = doc.splitTextToSize(c.nombre, anchoColumna - 4).slice(0, 2)
      lineas.forEach((linea, idx) => {
        doc.text(linea, x + anchoColumna / 2, yInicio + 5 + idx * 4, { align: 'center' })
      })
    })
    return yInicio + 11
  }

  y = dibujarEncabezadoColumnas(y)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)

  for (const fila of filas) {
    const lineasEtiqueta = doc.splitTextToSize(fila.etiqueta, anchoEtiqueta - 4)
    let maxLineas = lineasEtiqueta.length
    const lineasPorColumna = columnas.map(c => {
      const lineas = doc.splitTextToSize(String(fila.valor(c)), anchoColumna - 4)
      maxLineas = Math.max(maxLineas, lineas.length)
      return lineas
    })
    const alturaFila = Math.max(8, maxLineas * 4.2 + 3)

    if (y + alturaFila > altoPagina - 20) {
      doc.addPage()
      y = 20
      y = dibujarEncabezadoColumnas(y)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
    }

    if (fila.destacada) {
      doc.setFillColor(...COLOR_FONDO_SUAVE)
      doc.rect(MARGEN, y - 1, anchoPagina - MARGEN * 2, alturaFila, 'F')
    }

    doc.setFont('helvetica', fila.destacada ? 'bold' : 'normal')
    doc.setTextColor(...COLOR_TEXTO)
    lineasEtiqueta.forEach((linea, idx) => {
      doc.text(linea, MARGEN + 2, y + 4.5 + idx * 4.2)
    })
    columnas.forEach((c, i) => {
      const x = MARGEN + anchoEtiqueta + i * anchoColumna
      lineasPorColumna[i].forEach((linea, idx) => {
        doc.text(linea, x + anchoColumna / 2, y + 4.5 + idx * 4.2, { align: 'center' })
      })
    })

    y += alturaFila
    doc.setDrawColor(...COLOR_BORDE)
    doc.setLineWidth(0.15)
    doc.line(MARGEN, y - 1, anchoPagina - MARGEN, y - 1)
  }

  dibujarPiePagina(doc, fecha)
  doc.save(`comparativa-trailers-${formatoFechaArchivo(fecha)}.pdf`)
}
