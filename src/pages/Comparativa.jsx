import { useState, useMemo, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, guardarBorrador, getRedondeo } from '../db/database'
import { calcularPrecioConGanancia, desglosarEstandarYOpcionales } from '../utils/calcularPrecio'
import { generarPdfComparativa } from '../utils/generarPdf'
import { formatoARS, NOTA_IVA } from '../utils/formato'
import { variablesDesdeSeleccion } from '../utils/seleccionVariables'
import { leerImagenComoDataUrl } from '../utils/imagenes'
import SelectorVariables from '../components/SelectorVariables'
import SelectorOrden from '../components/SelectorOrden'
import { ordenar } from '../utils/ordenar'
import CampoObservaciones from '../components/CampoObservaciones'
import { CLASE_TRAILERS, perteneceAClase, claseDe, nombreClase } from '../utils/clasesProductos'
import { useToast } from '../components/Toast'
import { EnShell } from '../components/Shell'

let contadorLocal = 0
function nuevoId() {
  contadorLocal += 1
  return contadorLocal
}

function crearModelo(nombre) {
  return { id: nuevoId(), nombre, tipoTrailerId: '', seleccionadas: {}, imagen: null }
}

/**
 * Permite armar varias configuraciones (distintos modelos/variables) y ver
 * los resultados uno al lado del otro, para facilitarle la comparación al cliente.
 */
export default function Comparativa({ claseId, clases }) {
  const showToast = useToast()
  const tipos = useLiveQuery(() => db.tiposTrailer.filter(item => perteneceAClase(item, claseId)).toArray(), [claseId]) ?? []
  const variables = useLiveQuery(() => db.variables.filter(item => perteneceAClase(item, claseId)).toArray(), [claseId]) ?? []
  const [redondeo, setRedondeoLocal] = useState(1)

  const [modelos, setModelos] = useState(() => [crearModelo('Opción 1'), crearModelo('Opción 2')])
  const [nombreCliente, setNombreCliente] = useState('')
  const [razonSocial, setRazonSocial] = useState('')
  const [cuit, setCuit] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [borradorListo, setBorradorListo] = useState(false)
  const [orden, setOrden] = useState('nombre-asc')

  useEffect(() => {
    getRedondeo().then(setRedondeoLocal)
  }, [])

  // Igual que en Cotizador: restaura el borrador al montar para no perder la
  // comparativa al cambiar de pestaña o cerrar la app.
  useEffect(() => {
    db.config.get('borradorComparativa')
      .then(registro => {
        const borrador = registro?.valor
        if (borrador?.modelos?.length && (borrador.claseId ?? CLASE_TRAILERS) === claseId) {
          // Evita que nuevoId() repita ids de los modelos restaurados
          contadorLocal = Math.max(contadorLocal, ...borrador.modelos.map(m => m.id))
          setModelos(borrador.modelos)
          setNombreCliente(borrador.nombreCliente ?? '')
          setRazonSocial(borrador.razonSocial ?? '')
          setCuit(borrador.cuit ?? '')
          setObservaciones(borrador.observaciones ?? '')
        }
      })
      .finally(() => setBorradorListo(true))
  }, [])

  useEffect(() => {
    if (!borradorListo) return
    guardarBorrador('comparativa', 'borradorComparativa', claseId, { modelos, nombreCliente, razonSocial, cuit, observaciones })
      .catch(() => showToast('No se pudo guardar el borrador. Intentá nuevamente.', 'error'))
  }, [claseId, borradorListo, modelos, nombreCliente, razonSocial, cuit, observaciones])

  function limpiarBorrador() {
    setModelos([crearModelo('Opción 1'), crearModelo('Opción 2')])
    setNombreCliente('')
    setRazonSocial('')
    setCuit('')
    setObservaciones('')
  }

  function agregarModelo() {
    setModelos(prev => [...prev, crearModelo(`Opción ${prev.length + 1}`)])
  }

  function eliminarModelo(id) {
    setModelos(prev => prev.filter(m => m.id !== id))
  }

  function actualizarModelo(id, cambios) {
    setModelos(prev => prev.map(m => (m.id === id ? { ...m, ...cambios } : m)))
  }

  function toggleVariable(modeloId, variableId) {
    setModelos(prev => prev.map(m => {
      if (m.id !== modeloId) return m
      const seleccionadas = { ...m.seleccionadas }
      if (Object.prototype.hasOwnProperty.call(seleccionadas, variableId)) {
        delete seleccionadas[variableId]
      } else {
        seleccionadas[variableId] = 1
      }
      return { ...m, seleccionadas }
    }))
  }

  async function cambiarImagen(modeloId, file) {
    if (!file) return
    try {
      const imagen = await leerImagenComoDataUrl(file)
      actualizarModelo(modeloId, { imagen })
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  function cambiarCantidad(modeloId, variableId, valor) {
    const cantidad = Math.min(999, Math.max(1, Math.floor(Number(valor)) || 1))
    setModelos(prev => prev.map(m => {
      if (m.id !== modeloId) return m
      return { ...m, seleccionadas: { ...m.seleccionadas, [variableId]: cantidad } }
    }))
  }

  const filasComparativa = useMemo(() => {
    return modelos.map(m => {
      const tipoTrailer = tipos.find(t => t.id === Number(m.tipoTrailerId))
      const variablesSeleccionadas = variablesDesdeSeleccion(variables, m.seleccionadas)
      const resultado = tipoTrailer ? calcularPrecioConGanancia(tipoTrailer, variablesSeleccionadas, redondeo).valor : null
      const { precioEstandar, totalOpcionales } = resultado
        ? desglosarEstandarYOpcionales(resultado)
        : { precioEstandar: 0, totalOpcionales: 0 }
      return { modelo: m, tipoTrailer, variablesSeleccionadas, resultado, precioEstandar, totalOpcionales }
    })
  }, [modelos, tipos, variables, redondeo])

  // Unión de todas las variables usadas en algún modelo, para armar las filas de la tabla
  const variablesEnUso = useMemo(() => {
    const ids = new Set()
    for (const fila of filasComparativa) {
      for (const v of fila.variablesSeleccionadas) ids.add(v.id)
    }
    return variables
      .filter(v => ids.has(v.id))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  }, [filasComparativa, variables])

  const hayAlgoParaComparar = filasComparativa.some(f => f.tipoTrailer)

  async function descargarComparativaPdf() {
    const modelosValidos = filasComparativa.filter(f => f.tipoTrailer && f.resultado)
    if (modelosValidos.length === 0) {
      showToast('Completá al menos un modelo con tipo de producto para exportar', 'error')
      return
    }
    const columnas = modelosValidos.map(f => {
      // Indexado por id (no por nombre) para que dos variables con el mismo
      // nombre en categorías distintas no se pisen entre sí.
      const valoresVariables = {}
      for (const v of variablesEnUso) {
        const seleccionada = f.variablesSeleccionadas.find(sv => sv.id === v.id)
        if (v.esOpcional) {
          const detalleItem = f.resultado.detalle.find(d => d.id === v.id)
          valoresVariables[v.id] = detalleItem ? formatoARS.format(detalleItem.monto) : '—'
        } else {
          valoresVariables[v.id] = seleccionada
            ? (seleccionada.cantidad > 1 ? `Sí (x${seleccionada.cantidad})` : 'Sí')
            : '—'
        }
      }
      return {
        nombre: f.modelo.nombre || 'Sin nombre',
        tipoTrailerNombre: f.tipoTrailer.nombre,
        precioEstandar: f.precioEstandar,
        totalOpcionales: f.totalOpcionales,
        total: f.resultado.precioFinal,
        valoresVariables,
        imagen: f.modelo.imagen
      }
    })
    await generarPdfComparativa({
      fecha: new Date().toISOString(),
      cliente: { nombreCliente: nombreCliente.trim(), razonSocial: razonSocial.trim(), cuit: cuit.trim() },
      observaciones: observaciones.trim(),
      variablesInfo: variablesEnUso.map(v => ({ id: v.id, nombre: v.nombre, esOpcional: !!v.esOpcional })),
      columnas
    })
  }

  return (
    <div className="pagina">
      <div className="barra-pagina">
        <div className="barra-pagina-titulo">
          <h1>Comparativa de modelos</h1>
          <span className="meta">{modelos.length} opci{modelos.length === 1 ? 'ón' : 'ones'}</span>
        </div>
        <div className="barra-pagina-acciones">
          <SelectorOrden value={orden} onChange={setOrden} />
          <button type="button" className="btn-secundario" onClick={limpiarBorrador} disabled={!borradorListo}>
            Limpiar
          </button>
          <button type="button" className="btn-primario" onClick={descargarComparativaPdf}>Descargar PDF</button>
        </div>
      </div>

      <div className="pagina-cuerpo pila">
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

        <div className="comparativa-modelos">
          {modelos.map(m => (
            <TarjetaModelo
              key={m.id}
              modelo={m}
              tipos={ordenar(tipos, orden)}
              orden={orden}
              clases={clases}
              variables={variables}
              onCambiarNombre={nombre => actualizarModelo(m.id, { nombre })}
              onCambiarTipo={tipoTrailerId => actualizarModelo(m.id, { tipoTrailerId })}
              onToggleVariable={variableId => toggleVariable(m.id, variableId)}
              onCantidadChange={(variableId, valor) => cambiarCantidad(m.id, variableId, valor)}
              onCambiarImagen={file => cambiarImagen(m.id, file)}
              onQuitarImagen={() => actualizarModelo(m.id, { imagen: null })}
              onEliminar={modelos.length > 1 ? () => eliminarModelo(m.id) : null}
            />
          ))}
          <button type="button" className="btn-agregar-columna" onClick={agregarModelo}>+ Agregar opción</button>
        </div>

        {hayAlgoParaComparar && (
          <section className="panel" aria-label="Tabla comparativa">
            <div className="tabla-scroll">
              <table className="tabla tabla-comparativa">
                <thead>
                  <tr>
                    <th scope="col">Comparación</th>
                    {filasComparativa.map(f => (
                      <th scope="col" key={f.modelo.id} className="col-num">{f.modelo.nombre || 'Sin nombre'}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">Tipo de producto</th>
                    {filasComparativa.map(f => (
                      <td key={f.modelo.id} className="col-num">{f.tipoTrailer?.nombre ?? '—'}</td>
                    ))}
                  </tr>
                  <tr>
                    <th scope="row">Precio estándar</th>
                    {filasComparativa.map(f => (
                      <td key={f.modelo.id} className="col-num price-num">{f.resultado ? formatoARS.format(f.precioEstandar) : '—'}</td>
                    ))}
                  </tr>
                  {variablesEnUso.map(v => (
                    <tr key={v.id}>
                      <th scope="row">{v.nombre}</th>
                      {filasComparativa.map(f => {
                        const seleccionada = f.variablesSeleccionadas.find(sv => sv.id === v.id)
                        if (v.esOpcional) {
                          const detalleItem = f.resultado?.detalle.find(d => d.id === v.id)
                          return (
                            <td key={f.modelo.id} className="col-num price-num">{detalleItem ? formatoARS.format(detalleItem.monto) : '—'}</td>
                          )
                        }
                        return (
                          <td key={f.modelo.id} className="col-num">
                            {seleccionada
                              ? (seleccionada.cantidad > 1 ? `Sí (x${seleccionada.cantidad})` : 'Sí')
                              : <span className="texto-tenue">—</span>}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                  <tr className="fila-total">
                    <th scope="row">Total <span className="nota-iva">{NOTA_IVA}</span></th>
                    {filasComparativa.map(f => (
                      <td key={f.modelo.id} className="col-num price-num">
                        {f.resultado ? formatoARS.format(f.resultado.precioFinal) : '—'}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section className="panel">
          <h2 className="panel-titulo">Observaciones</h2>
          <div className="panel-cuerpo">
            <CampoObservaciones value={observaciones} onChange={setObservaciones} />
          </div>
        </section>
      </div>

      <EnShell zona="estado">
        <span>{modelos.length} opci{modelos.length === 1 ? 'ón' : 'ones'}</span>
        <span>{filasComparativa.filter(f => f.tipoTrailer).length} con producto elegido</span>
        <span>Clase: {nombreClase(clases, claseId)}</span>
      </EnShell>
    </div>
  )
}

function TarjetaModelo({ modelo, tipos, orden, clases, variables, onCambiarNombre, onCambiarTipo, onToggleVariable, onCantidadChange, onCambiarImagen, onQuitarImagen, onEliminar }) {
  const nombre = modelo.nombre || 'Opción sin nombre'
  return (
    <section className="panel tarjeta-modelo" aria-label={nombre}>
      <div className="tarjeta-modelo-cabecera">
        <input
          className="input-nombre-modelo"
          aria-label="Nombre de la opción"
          placeholder="Nombre de la opción"
          value={modelo.nombre}
          onChange={e => onCambiarNombre(e.target.value)}
        />
        {onEliminar && (
          <button type="button" className="btn-icono" onClick={onEliminar} aria-label={`Quitar ${nombre}`} title="Quitar opción">×</button>
        )}
      </div>

      <SelectorVariables
        variables={variables}
        clases={clases}
        orden={orden}
        seleccionadas={modelo.seleccionadas}
        onToggle={onToggleVariable}
        onCantidadChange={onCantidadChange}
      >
        <label className="campo campo-ancho">
          Tipo de producto
          <select value={modelo.tipoTrailerId} onChange={e => onCambiarTipo(e.target.value)}>
            <option value="">Seleccionar...</option>
            {tipos.map(t => (
              <option key={t.id} value={t.id}>{t.nombre} ({nombreClase(clases, claseDe(t))}) — {formatoARS.format(t.precioBase)}</option>
            ))}
          </select>
        </label>
      </SelectorVariables>

      <div className="tarjeta-modelo-pie fila-imagenes">
        {modelo.imagen ? (
          <div className="miniatura-imagen">
            <img src={modelo.imagen} alt={`Imagen de ${nombre}`} />
            <button
              type="button"
              className="btn-quitar-imagen"
              onClick={onQuitarImagen}
              aria-label="Quitar imagen"
              title="Quitar imagen"
            >
              ×
            </button>
          </div>
        ) : (
          <label className="btn-archivo">
            <input
              type="file"
              accept="image/*"
              className="campo-oculto"
              onChange={e => {
                onCambiarImagen(e.target.files?.[0])
                e.target.value = ''
              }}
            />
            + Imagen
          </label>
        )}
      </div>
    </section>
  )
}
