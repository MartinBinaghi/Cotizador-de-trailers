import { useState, useMemo, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getRedondeo } from '../db/database'
import { calcularPrecio } from '../utils/calcularPrecio'
import { generarPdfCotizacion } from '../utils/generarPdf'
import { formatoARS, NOTA_IVA } from '../utils/formato'
import { normalizarSeleccionadas, serializarSeleccionadas, variablesDesdeSeleccion } from '../utils/seleccionVariables'
import { leerImagenComoDataUrl } from '../utils/imagenes'
import SelectorVariables from '../components/SelectorVariables'
import { useToast } from '../components/Toast'

const MAX_IMAGENES = 3

/**
 * @param {object} props
 * @param {{tipoTrailerId: number, seleccionadas: Array|object, cliente: {nombreCliente: string, razonSocial: string, cuit: string}, imagenes?: string[]}|null} props.datosIniciales
 *   Si viene seteado (ej. al duplicar una cotización desde el Historial), precarga el formulario.
 * @param {() => void} props.onConsumirDatosIniciales callback para limpiar datosIniciales luego de usarlos
 */
export default function Cotizador({ datosIniciales, onConsumirDatosIniciales }) {
  const showToast = useToast()
  const tipos = useLiveQuery(() => db.tiposTrailer.toArray(), []) ?? []
  const variables = useLiveQuery(() => db.variables.toArray(), []) ?? []

  const [tipoTrailerId, setTipoTrailerId] = useState('')
  const [seleccionadas, setSeleccionadas] = useState({})
  const [nombreCliente, setNombreCliente] = useState('')
  const [razonSocial, setRazonSocial] = useState('')
  const [cuit, setCuit] = useState('')
  const [imagenes, setImagenes] = useState([])
  const [redondeo, setRedondeoLocal] = useState(1)

  useEffect(() => {
    getRedondeo().then(setRedondeoLocal)
  }, [])

  // Si llegan datos para duplicar una cotización anterior, los precarga una sola vez
  useEffect(() => {
    if (datosIniciales) {
      setTipoTrailerId(String(datosIniciales.tipoTrailerId))
      setSeleccionadas(normalizarSeleccionadas(datosIniciales.seleccionadas))
      setNombreCliente(datosIniciales.cliente?.nombreCliente || '')
      setRazonSocial(datosIniciales.cliente?.razonSocial || '')
      setCuit(datosIniciales.cliente?.cuit || '')
      setImagenes(datosIniciales.imagenes || [])
      onConsumirDatosIniciales?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datosIniciales])

  const tipoTrailer = tipos.find(t => t.id === Number(tipoTrailerId))

  const variablesSeleccionadas = useMemo(
    () => variablesDesdeSeleccion(variables, seleccionadas),
    [variables, seleccionadas]
  )

  const resultado = useMemo(
    () => (tipoTrailer ? calcularPrecio(tipoTrailer, variablesSeleccionadas, redondeo) : null),
    [tipoTrailer, variablesSeleccionadas, redondeo]
  )

  const totalOpcionales = resultado
    ? resultado.detalle.filter(d => d.esOpcional).reduce((acc, d) => acc + d.monto, 0)
    : 0
  const precioEstandar = resultado
    ? resultado.base + resultado.detalle.filter(d => !d.esOpcional).reduce((acc, d) => acc + d.monto, 0)
    : 0

  function toggleVariable(id) {
    setSeleccionadas(prev => {
      if (Object.prototype.hasOwnProperty.call(prev, id)) {
        const { [id]: _omitida, ...resto } = prev
        return resto
      }
      return { ...prev, [id]: 1 }
    })
  }

  function cambiarCantidad(id, valor) {
    const cantidad = Math.max(1, Math.floor(Number(valor)) || 1)
    setSeleccionadas(prev => ({ ...prev, [id]: cantidad }))
  }

  async function agregarImagenes(e) {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    const espacioDisponible = MAX_IMAGENES - imagenes.length
    if (files.length > espacioDisponible) {
      showToast(`Se pueden cargar hasta ${MAX_IMAGENES} imágenes.`, 'error')
    }
    const seleccionadas = files.slice(0, espacioDisponible)
    try {
      const nuevas = await Promise.all(seleccionadas.map(leerImagenComoDataUrl))
      setImagenes(prev => [...prev, ...nuevas])
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      e.target.value = ''
    }
  }

  function quitarImagen(index) {
    setImagenes(prev => prev.filter((_, i) => i !== index))
  }

  async function guardarCotizacion() {
    if (!tipoTrailer || !resultado) {
      showToast('Elegí un tipo de trailer antes de guardar', 'error')
      return
    }
    await db.cotizaciones.add({
      tipoTrailerId: tipoTrailer.id,
      variablesSeleccionadas: serializarSeleccionadas(seleccionadas),
      precioFinal: resultado.precioFinal,
      cliente: { nombreCliente: nombreCliente.trim(), razonSocial: razonSocial.trim(), cuit: cuit.trim() },
      imagenes,
      fecha: new Date().toISOString()
    })
    showToast('Cotización guardada')
  }

  async function descargarPdf() {
    if (!tipoTrailer || !resultado) {
      showToast('Elegí un tipo de trailer antes de generar el PDF', 'error')
      return
    }
    await generarPdfCotizacion({
      cliente: { nombreCliente: nombreCliente.trim(), razonSocial: razonSocial.trim(), cuit: cuit.trim() },
      fecha: new Date().toISOString(),
      tipoTrailerNombre: tipoTrailer.nombre,
      variables: variablesSeleccionadas,
      resultado,
      imagenes
    })
  }

  return (
    <div className="page">
      <h2 className="titulo-pagina">Nueva cotización</h2>

      <div className="form-card">
        <div className="grupo-campo">
          <span className="grupo-titulo">Datos del cliente</span>
          <div className="fila-campos">
            <label className="campo">
              Nombre del cliente (opcional)
              <input value={nombreCliente} onChange={e => setNombreCliente(e.target.value)} placeholder="Nombre del cliente" />
            </label>

            <label className="campo">
              Razón social (opcional)
              <input value={razonSocial} onChange={e => setRazonSocial(e.target.value)} placeholder="Razón social" />
            </label>

            <label className="campo">
              CUIT (opcional)
              <input value={cuit} onChange={e => setCuit(e.target.value)} placeholder="CUIT" />
            </label>
          </div>
        </div>

        <hr className="divider" />

        <div className="grupo-campo">
          <span className="grupo-titulo">Configuración</span>
          <label className="campo">
            Tipo de trailer
            <select value={tipoTrailerId} onChange={e => setTipoTrailerId(e.target.value)}>
              <option value="">Seleccionar...</option>
              {tipos.map(t => (
                <option key={t.id} value={t.id}>{t.nombre} — {formatoARS.format(t.precioBase)}</option>
              ))}
            </select>
          </label>

          <SelectorVariables
            variables={variables}
            seleccionadas={seleccionadas}
            onToggle={toggleVariable}
            onCantidadChange={cambiarCantidad}
          />

          <div className="campo">
            <label>Imágenes (opcional, hasta {MAX_IMAGENES})</label>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={agregarImagenes}
              disabled={imagenes.length >= MAX_IMAGENES}
            />
            {imagenes.length > 0 && (
              <div className="miniaturas-imagenes">
                {imagenes.map((src, i) => (
                  <div className="miniatura-imagen" key={i}>
                    <img src={src} alt={`Imagen ${i + 1}`} />
                    <button type="button" className="btn-peligro" onClick={() => quitarImagen(i)}>Quitar</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {resultado && (
        <div className="resultado">
          <div className="linea-precio">
            <span>Precio estándar</span>
            <span className="price-num">{formatoARS.format(precioEstandar)}</span>
          </div>
          {totalOpcionales !== 0 && (
            <div className="linea-precio">
              <span>Adicionales opcionales</span>
              <span className="price-num">{formatoARS.format(totalOpcionales)}</span>
            </div>
          )}
          <div className="total-row">
            <span className="etiqueta">Total</span>
            <span>
              <span className="valor price-num">{formatoARS.format(resultado.precioFinal)}</span>
              <span className="nota-iva">{NOTA_IVA}</span>
            </span>
          </div>
          <div className="acciones-resultado">
            <button onClick={guardarCotizacion}>Guardar cotización</button>
            <button className="btn-secundario" onClick={descargarPdf}>Descargar PDF</button>
          </div>
        </div>
      )}
    </div>
  )
}
