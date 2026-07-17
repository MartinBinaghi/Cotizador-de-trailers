import { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/database'
import { calcularPrecioConGanancia } from '../utils/calcularPrecio'
import { generarPdfCotizacion } from '../utils/generarPdf'
import { formatoARS, NOTA_IVA } from '../utils/formato'
import { normalizarSeleccionadas, variablesDesdeSeleccion } from '../utils/seleccionVariables'
import { useToast } from '../components/Toast'

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
      const fechaC = c.fecha?.slice(0, 10)
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

  function duplicar(c) {
    onDuplicar?.({
      tipoTrailerId: c.tipoTrailerId,
      seleccionadas: c.variablesSeleccionadas,
      cliente: c.cliente,
      imagenes: c.imagenes || []
    })
    showToast('Cotización cargada en el cotizador')
  }

  async function descargarPdf(c) {
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
      imagenes: c.imagenes || []
    })
  }

  return (
    <div className="page">
      <h2 className="titulo-pagina">Historial de cotizaciones</h2>

      <div className="form-card">
        <div className="form-inline">
          <input
            placeholder="Buscar por cliente..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
          />
          <label className="filtro-fecha">
            Desde
            <input type="date" value={desde} onChange={e => setDesde(e.target.value)} />
          </label>
          <label className="filtro-fecha">
            Hasta
            <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} />
          </label>
        </div>
      </div>

      {cotizacionesFiltradas.length === 0 && <p>No hay cotizaciones que coincidan con la búsqueda.</p>}

      <ul className="lista-admin">
        {cotizacionesFiltradas.map(c => (
          <li className="fila-historial" key={c.id}>
            <span className="historial-fecha">{new Date(c.fecha).toLocaleString('es-AR')}</span>
            <span className="historial-cliente">{textoCliente(c)}</span>
            <span className="historial-tipo">{nombreTipo(c.tipoTrailerId)}</span>
            <strong className="price-num">{formatoARS.format(c.precioFinal)} <span className="nota-iva">{NOTA_IVA}</span></strong>
            <span className="acciones">
              <button className="btn-secundario" onClick={() => duplicar(c)}>Duplicar</button>
              <button className="btn-secundario" onClick={() => descargarPdf(c)}>PDF</button>
              <button className="btn-peligro" onClick={() => eliminar(c.id)}>Eliminar</button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
