import { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/database'
import { calcularPrecioConGanancia } from '../utils/calcularPrecio'
import { generarPdfCotizacion } from '../utils/generarPdf'
import { formatoARS, NOTA_IVA } from '../utils/formato'
import { normalizarSeleccionadas, variablesDesdeSeleccion } from '../utils/seleccionVariables'
import { useToast } from '../components/Toast'
import { EnShell } from '../components/Shell'

// Fecha local (no UTC) en formato YYYY-MM-DD, para que el filtro coincida
// con la fecha que se muestra en la lista (toLocaleString).
function fechaLocalISO(fechaIso) {
  const fecha = new Date(fechaIso)
  const pad = n => String(n).padStart(2, '0')
  return `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}`
}

export default function Historial({ onDuplicar }) {
  const showToast = useToast()
  const cotizaciones = useLiveQuery(
    () => db.cotizaciones.orderBy('fecha').reverse().toArray(),
    []
  ) ?? []
  const tipos = useLiveQuery(() => db.tiposTrailer.toArray(), []) ?? []
  const variables = useLiveQuery(() => db.variables.toArray(), []) ?? []

  const [busqueda, setBusqueda] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')

  function nombreTipo(id) {
    return tipos.find(t => t.id === id)?.nombre ?? 'Desconocido'
  }

  function textoCliente(c) {
    const { nombreCliente, razonSocial, cuit } = c.cliente || {}
    return nombreCliente?.trim() || razonSocial?.trim() || cuit?.trim() || 'Sin nombre'
  }

  const cotizacionesFiltradas = useMemo(() => {
    return cotizaciones.filter(c => {
      if (busqueda) {
        const termino = busqueda.toLowerCase()
        const { nombreCliente = '', razonSocial = '', cuit = '' } = c.cliente || {}
        const coincide = [nombreCliente, razonSocial, cuit].some(campo =>
          campo.toLowerCase().includes(termino)
        )
        if (!coincide) return false
      }
      const fechaC = c.fecha ? fechaLocalISO(c.fecha) : ''
      if (desde && fechaC < desde) return false
      if (hasta && fechaC > hasta) return false
      return true
    })
  }, [cotizaciones, busqueda, desde, hasta])

  async function eliminar(id) {
    if (confirm('¿Eliminar esta cotización del historial?')) {
      await db.cotizaciones.delete(id)
      showToast('Eliminada', 'info')
    }
  }

  async function duplicar(c) {
    await onDuplicar?.({
      claseEliminada: c.claseEliminada,
      claseId: c.claseId,
      tipoTrailerId: c.tipoTrailerId,
      seleccionadas: c.variablesSeleccionadas,
      cliente: c.cliente,
      imagenes: c.imagenes || [],
      observaciones: c.observaciones || ''
    })
    showToast('Cotización cargada en el cotizador')
  }

  async function descargarPdf(c) {
    if (c.snapshot) {
      // Cotizaciones con snapshot: el PDF sale del desglose guardado al
      // cotizar, inmune a cambios o bajas posteriores en el catálogo.
      await generarPdfCotizacion({
        cliente: c.cliente,
        fecha: c.fecha,
        tipoTrailerNombre: c.snapshot.tipoTrailerNombre,
        variables: c.snapshot.detalle,
        resultado: { base: c.snapshot.base, precioFinal: c.precioFinal, detalle: c.snapshot.detalle },
        imagenes: c.imagenes || [],
        observaciones: c.observaciones || ''
      })
      return
    }

    // Cotizaciones viejas sin snapshot: se recalcula con el catálogo actual
    // (los montos por línea pueden diferir del total histórico).
    const tipoTrailer = tipos.find(t => t.id === c.tipoTrailerId)
    const mapaSeleccion = normalizarSeleccionadas(c.variablesSeleccionadas)
    const variablesSeleccionadas = variablesDesdeSeleccion(variables, mapaSeleccion)
    if (!tipoTrailer) {
      showToast('No se encontró el tipo de trailer de esta cotización', 'error')
      return
    }
    // Recalcula con el precio ya guardado como referencia, sin volver a aplicar redondeo actual
    const { valor: resultado } = calcularPrecioConGanancia(tipoTrailer, variablesSeleccionadas, 1)
    resultado.precioFinal = c.precioFinal // respeta el precio histórico exacto
    await generarPdfCotizacion({
      cliente: c.cliente,
      fecha: c.fecha,
      tipoTrailerNombre: tipoTrailer.nombre,
      variables: variablesSeleccionadas,
      resultado,
      imagenes: c.imagenes || [],
      observaciones: c.observaciones || ''
    })
  }

  return (
    <div className="pagina">
      <div className="barra-pagina">
        <div className="barra-pagina-titulo">
          <h1>Historial de cotizaciones</h1>
          <span className="meta">{cotizaciones.length} guardada{cotizaciones.length === 1 ? '' : 's'}</span>
        </div>
      </div>

      <div className="pagina-cuerpo">
        <section className="panel">
          <div className="panel-cabecera">
            <h2 className="panel-titulo">Cotizaciones</h2>
            <div className="grupo-filtros">
              <label className="campo-oculto" htmlFor="buscar-historial">Buscar por cliente</label>
              <input
                id="buscar-historial"
                type="search"
                className="input-busqueda"
                placeholder="Buscar por cliente, razón social o CUIT"
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
              />
              <label className="selector-compacto">
                Desde
                <input type="date" value={desde} onChange={e => setDesde(e.target.value)} />
              </label>
              <label className="selector-compacto">
                Hasta
                <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} />
              </label>
            </div>
          </div>

          {cotizacionesFiltradas.length === 0 ? (
            <p className="panel-vacio">
              {cotizaciones.length === 0
                ? 'Todavía no hay cotizaciones guardadas. Creá la primera desde Cotizador.'
                : 'No hay cotizaciones que coincidan con la búsqueda.'}
            </p>
          ) : (
            <div className="tabla-scroll">
              <table className="tabla tabla-catalogo">
                <thead>
                  <tr>
                    <th scope="col">Fecha</th>
                    <th scope="col">Cliente</th>
                    <th scope="col">Producto</th>
                    <th scope="col" className="col-num">Total</th>
                    <th scope="col" className="col-acciones"><span className="campo-oculto">Acciones</span></th>
                  </tr>
                </thead>
                <tbody>
                  {cotizacionesFiltradas.map(c => (
                    <tr key={c.id}>
                      <td className="texto-suave price-num">{new Date(c.fecha).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                      <td>{textoCliente(c)}</td>
                      <td>{c.snapshot?.tipoTrailerNombre ?? nombreTipo(c.tipoTrailerId)}</td>
                      <td className="col-num price-num">
                        {formatoARS.format(c.precioFinal)} <span className="nota-iva">{NOTA_IVA}</span>
                      </td>
                      <td className="col-acciones">
                        <div className="grupo-botones">
                          <button type="button" className="btn-secundario btn-chico" onClick={() => duplicar(c)}>Duplicar</button>
                          <button type="button" className="btn-secundario btn-chico" onClick={() => descargarPdf(c)}>PDF</button>
                          <button type="button" className="btn-peligro btn-chico" onClick={() => eliminar(c.id)}>Eliminar</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <EnShell zona="estado">
        <span>{cotizacionesFiltradas.length} de {cotizaciones.length} cotizaciones</span>
      </EnShell>
    </div>
  )
}
