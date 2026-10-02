import { useState, useMemo, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, guardarBorrador, getRedondeo, setRedondeo } from '../db/database'
import { calcularPrecioConGanancia, desglosarEstandarYOpcionales } from '../utils/calcularPrecio'
import { generarPdfCotizacion } from '../utils/generarPdf'
import { formatoARS, NOTA_IVA } from '../utils/formato'
import { normalizarSeleccionadas, serializarSeleccionadas, variablesDesdeSeleccion } from '../utils/seleccionVariables'
import { leerImagenComoDataUrl } from '../utils/imagenes'
import SelectorVariables from '../components/SelectorVariables'
import SelectorOrden from '../components/SelectorOrden'
import { ordenar } from '../utils/ordenar'
import CampoObservaciones from '../components/CampoObservaciones'
import { CLASE_TRAILERS, perteneceAClase, claseDe, nombreClase, seleccionVisible } from '../utils/clasesProductos'
import { useToast } from '../components/Toast'
import { EnShell } from '../components/Shell'

const MAX_IMAGENES = 3

/**
 * @param {object} props
 * @param {{tipoTrailerId: number, seleccionadas: Array|object, cliente: {nombreCliente: string, razonSocial: string, cuit: string}, imagenes?: string[]}|null} props.datosIniciales
 *   Si viene seteado (ej. al duplicar una cotización desde el Historial), precarga el formulario.
 * @param {() => void} props.onConsumirDatosIniciales callback para limpiar datosIniciales luego de usarlos
 */
export default function Cotizador({ datosIniciales, onConsumirDatosIniciales, claseId, clases }) {
  const showToast = useToast()
  const tipos = useLiveQuery(() => db.tiposTrailer.filter(item => perteneceAClase(item, claseId)).toArray(), [claseId]) ?? []
  const variables = useLiveQuery(() => db.variables.filter(item => perteneceAClase(item, claseId)).toArray(), [claseId]) ?? []

  const [tipoTrailerId, setTipoTrailerId] = useState('')
  const [seleccionadas, setSeleccionadas] = useState({})
  const [nombreCliente, setNombreCliente] = useState('')
  const [razonSocial, setRazonSocial] = useState('')
  const [cuit, setCuit] = useState('')
  const [imagenes, setImagenes] = useState([])
  const [observaciones, setObservaciones] = useState('')
  const [redondeo, setRedondeoLocal] = useState(1)
  const [guardando, setGuardando] = useState(false)
  const [cargandoImagenes, setCargandoImagenes] = useState(false)
  const [versionFormulario, setVersionFormulario] = useState(0)
  const [borradorListo, setBorradorListo] = useState(false)
  const [ultimoGuardado, setUltimoGuardado] = useState(null)
  const [orden, setOrden] = useState('nombre-asc')

  useEffect(() => {
    getRedondeo().then(setRedondeoLocal)
  }, [])

  // Restaura el borrador guardado al montar, para no perder el formulario al
  // recargar o cerrar la app. Si se está duplicando una cotización, esos
  // datos tienen prioridad y pisan el borrador.
  useEffect(() => {
    if (datosIniciales) {
      setBorradorListo(true)
      return
    }
    db.config.get('borradorCotizador')
      .then(registro => {
        const borrador = registro?.valor
        if (borrador && (borrador.claseId ?? CLASE_TRAILERS) === claseId) {
          setTipoTrailerId(borrador.tipoTrailerId ?? '')
          setSeleccionadas(borrador.seleccionadas ?? {})
          setNombreCliente(borrador.nombreCliente ?? '')
          setRazonSocial(borrador.razonSocial ?? '')
          setCuit(borrador.cuit ?? '')
          setImagenes(borrador.imagenes ?? [])
          setObservaciones(borrador.observaciones ?? '')
        }
      })
      .finally(() => setBorradorListo(true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Persiste el borrador ante cualquier cambio del formulario
  useEffect(() => {
    if (!borradorListo) return
    guardarBorrador('cotizador', 'borradorCotizador', claseId, { tipoTrailerId, seleccionadas, nombreCliente, razonSocial, cuit, imagenes, observaciones })
      .then(() => setUltimoGuardado(new Date()))
      .catch(() => showToast('No se pudo guardar el borrador. Intentá nuevamente.', 'error'))
  }, [claseId, borradorListo, tipoTrailerId, seleccionadas, nombreCliente, razonSocial, cuit, imagenes, observaciones])

  // Si llegan datos para duplicar una cotización anterior, los precarga una sola vez
  useEffect(() => {
    if (datosIniciales) {
      setTipoTrailerId(String(datosIniciales.tipoTrailerId))
      setSeleccionadas(normalizarSeleccionadas(datosIniciales.seleccionadas))
      setNombreCliente(datosIniciales.cliente?.nombreCliente || '')
      setRazonSocial(datosIniciales.cliente?.razonSocial || '')
      setCuit(datosIniciales.cliente?.cuit || '')
      setImagenes(datosIniciales.imagenes || [])
      setObservaciones(datosIniciales.observaciones || '')
      onConsumirDatosIniciales?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datosIniciales])

  const tipoTrailer = tipos.find(t => t.id === Number(tipoTrailerId))

  const variablesSeleccionadas = useMemo(
    () => variablesDesdeSeleccion(variables, seleccionadas),
    [variables, seleccionadas]
  )

  const { costo, valor: resultado } = useMemo(
    () => (tipoTrailer ? calcularPrecioConGanancia(tipoTrailer, variablesSeleccionadas, redondeo) : { costo: null, valor: null }),
    [tipoTrailer, variablesSeleccionadas, redondeo]
  )

  const { precioEstandar, totalOpcionales } = resultado
    ? desglosarEstandarYOpcionales(resultado)
    : { precioEstandar: 0, totalOpcionales: 0 }

  const margenGanancia = costo && resultado ? resultado.precioFinal - costo.precioFinal : 0
  const margenGananciaPct = costo && costo.precioFinal > 0 ? (margenGanancia / costo.precioFinal) * 100 : 0

  function limpiarBorrador() {
    setTipoTrailerId('')
    setSeleccionadas({})
    setNombreCliente('')
    setRazonSocial('')
    setCuit('')
    setImagenes([])
    setObservaciones('')
    setVersionFormulario(version => version + 1)
  }

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
    const cantidad = Math.min(999, Math.max(1, Math.floor(Number(valor)) || 1))
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
    setCargandoImagenes(true)
    try {
      const nuevas = await Promise.all(seleccionadas.map(leerImagenComoDataUrl))
      setImagenes(prev => [...prev, ...nuevas])
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      e.target.value = ''
      setCargandoImagenes(false)
    }
  }

  function quitarImagen(index) {
    setImagenes(prev => prev.filter((_, i) => i !== index))
  }

  async function cambiarRedondeo(valor) {
    const redondeoNuevo = Number(valor)
    setRedondeoLocal(redondeoNuevo)
    await setRedondeo(redondeoNuevo)
  }

  async function guardarCotizacion() {
    if (!tipoTrailer || !resultado) {
      showToast('Elegí un tipo de producto antes de guardar', 'error')
      return
    }
    setGuardando(true)
    try {
      await db.cotizaciones.add({
        claseId,
        tipoTrailerId: tipoTrailer.id,
        variablesSeleccionadas: serializarSeleccionadas(seleccionVisible(seleccionadas, variables)),
        precioFinal: resultado.precioFinal,
        cliente: { nombreCliente: nombreCliente.trim(), razonSocial: razonSocial.trim(), cuit: cuit.trim() },
        imagenes,
        observaciones: observaciones.trim(),
        fecha: new Date().toISOString(),
        // Snapshot del desglose al momento de cotizar: el PDF histórico se
        // dibuja desde acá y no cambia aunque después cambien los precios
        // del catálogo o se eliminen variables.
        snapshot: {
          tipoTrailerNombre: tipoTrailer.nombre,
          base: resultado.base,
          detalle: resultado.detalle.map(d => ({ ...d, cantidad: seleccionadas[d.id] ?? 1 }))
        }
      })
      showToast('Cotización guardada')
    } finally {
      setGuardando(false)
    }
  }

  async function descargarPdf() {
    if (!tipoTrailer || !resultado) {
      showToast('Elegí un tipo de producto antes de generar el PDF', 'error')
      return
    }
    await generarPdfCotizacion({
      cliente: { nombreCliente: nombreCliente.trim(), razonSocial: razonSocial.trim(), cuit: cuit.trim() },
      fecha: new Date().toISOString(),
      tipoTrailerNombre: tipoTrailer.nombre,
      variables: variablesSeleccionadas,
      resultado,
      imagenes,
      observaciones: observaciones.trim()
    })
  }

  const horaGuardado = ultimoGuardado?.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  const cantidadSeleccionadas = variablesSeleccionadas.length

  return (
    <div className="pagina">
      <div className="barra-pagina">
        <div className="barra-pagina-titulo">
          <h1>Nueva cotización</h1>
          {tipoTrailer && <span className="meta">{tipoTrailer.nombre}</span>}
        </div>
        <div className="barra-pagina-acciones">
          <button
            type="button"
            className="btn-secundario"
            onClick={limpiarBorrador}
            disabled={!borradorListo || guardando || cargandoImagenes}
          >
            Limpiar
          </button>
          <button type="button" className="btn-secundario" onClick={descargarPdf}>Descargar PDF</button>
          <button type="button" className="btn-primario" onClick={guardarCotizacion} disabled={guardando}>
            {guardando ? 'Guardando...' : 'Guardar cotización'}
          </button>
        </div>
      </div>

      <div className="pagina-cuerpo layout-con-resumen">
        <div className="columna-principal">
          <section className="panel">
            <h2 className="panel-titulo">Cliente</h2>
            <div className="panel-cuerpo fila-campos">
              <label className="campo">
                Nombre del cliente
                <input value={nombreCliente} onChange={e => setNombreCliente(e.target.value)} placeholder="Opcional" />
              </label>
              <label className="campo">
                Razón social
                <input value={razonSocial} onChange={e => setRazonSocial(e.target.value)} placeholder="Opcional" />
              </label>
              <label className="campo">
                CUIT
                <input value={cuit} onChange={e => setCuit(e.target.value)} placeholder="Opcional" />
              </label>
            </div>
          </section>

          <section className="panel">
            <div className="panel-cabecera">
              <h2 className="panel-titulo">Configuración</h2>
              <SelectorOrden value={orden} onChange={setOrden} />
            </div>
            <SelectorVariables
              key={versionFormulario}
              variables={variables}
              clases={clases}
              orden={orden}
              seleccionadas={seleccionadas}
              onToggle={toggleVariable}
              onCantidadChange={cambiarCantidad}
            >
              <label className="campo campo-ancho">
                Tipo de producto
                <select value={tipoTrailerId} onChange={e => setTipoTrailerId(e.target.value)}>
                  <option value="">Seleccionar...</option>
                  {ordenar(tipos, orden).map(t => (
                    <option key={t.id} value={t.id}>{t.nombre} ({nombreClase(clases, claseDe(t))}) — {formatoARS.format(t.precioBase)}</option>
                  ))}
                </select>
              </label>
            </SelectorVariables>
          </section>

          <section className="panel">
            <h2 className="panel-titulo">Imágenes y observaciones</h2>
            <div className="panel-cuerpo pila">
              <div className="campo">
                <span>Imágenes (opcional, hasta {MAX_IMAGENES})</span>
                <div className="fila-imagenes">
                  {imagenes.map((src, i) => (
                    <div className="miniatura-imagen" key={i}>
                      <img src={src} alt={`Imagen ${i + 1}`} />
                      <button
                        type="button"
                        className="btn-quitar-imagen"
                        onClick={() => quitarImagen(i)}
                        aria-label={`Quitar imagen ${i + 1}`}
                        title="Quitar imagen"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {imagenes.length < MAX_IMAGENES && (
                    <label className="btn-archivo">
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="campo-oculto"
                        onChange={agregarImagenes}
                        disabled={cargandoImagenes}
                      />
                      {cargandoImagenes ? 'Cargando…' : '+ Agregar imagen'}
                    </label>
                  )}
                </div>
              </div>
              <CampoObservaciones value={observaciones} onChange={setObservaciones} />
            </div>
          </section>
        </div>

        <aside className="columna-resumen" aria-label="Resumen de la cotización">
          <section className="panel resumen">
            <div className="resumen-cabecera">
              <span className="eyebrow">Resumen</span>
              <span className="resumen-producto">{tipoTrailer?.nombre ?? 'Sin producto'}</span>
            </div>
            {resultado ? (
              <>
                <div className="resumen-lineas">
                  <div className="linea-precio"><span>Precio base</span><span className="price-num">{formatoARS.format(resultado.base)}</span></div>
                  {resultado.detalle.map(d => (
                    <div className="linea-precio" key={d.id}>
                      <span>{d.nombre}{seleccionadas[d.id] > 1 ? ` ×${seleccionadas[d.id]}` : ''}{d.esOpcional ? ' (opcional)' : ''}</span>
                      <span className="price-num">{formatoARS.format(d.monto)}</span>
                    </div>
                  ))}
                  <hr className="divider" />
                  <div className="linea-precio"><span>Precio estándar</span><span className="price-num">{formatoARS.format(precioEstandar)}</span></div>
                  <div className="linea-precio"><span>Adicionales opcionales</span><span className="price-num">{formatoARS.format(totalOpcionales)}</span></div>
                </div>
                <div className="resumen-total">
                  <div className="resumen-total-etiqueta">
                    <span className="eyebrow">Total</span>
                    <span className="nota-iva">{NOTA_IVA}</span>
                  </div>
                  <span className="valor price-num">{formatoARS.format(resultado.precioFinal)}</span>
                </div>
              </>
            ) : (
              <p className="resumen-vacio">Elegí un tipo de producto para ver el precio.</p>
            )}
            <div className="resumen-pie">
              <label className="selector-compacto">
                Redondeo
                <select value={redondeo} onChange={e => cambiarRedondeo(e.target.value)}>
                  <option value={1}>Sin redondeo</option>
                  <option value={100}>$100</option>
                  <option value={1000}>$1.000</option>
                  <option value={10000}>$10.000</option>
                </select>
              </label>
            </div>
          </section>

          {resultado && costo && (
            <section className="panel panel-interno" aria-label="Datos internos">
              <div className="panel-interno-cabecera">
                <span className="eyebrow">Interno</span>
                <span className="texto-tenue">No aparece en el PDF</span>
              </div>
              <div className="linea-precio"><span>Costo total</span><span className="price-num">{formatoARS.format(costo.precioFinal)}</span></div>
              <div className="linea-precio"><span>Margen de ganancia</span><span className="price-num">{formatoARS.format(margenGanancia)} · {margenGananciaPct.toFixed(1)}%</span></div>
            </section>
          )}
        </aside>
      </div>

      <EnShell zona="estado">
        <span>{horaGuardado ? `Borrador guardado ${horaGuardado}` : 'Borrador sin cambios'}</span>
        <span>{cantidadSeleccionadas} variable{cantidadSeleccionadas === 1 ? '' : 's'} seleccionada{cantidadSeleccionadas === 1 ? '' : 's'}</span>
        <span>Clase: {nombreClase(clases, claseId)}</span>
      </EnShell>
    </div>
  )
}
