import { useState, useMemo, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getRedondeo } from '../db/database'
import { calcularPrecioConGanancia, desglosarEstandarYOpcionales } from '../utils/calcularPrecio'
import { generarPdfComparativa } from '../utils/generarPdf'
import { formatoARS, NOTA_IVA } from '../utils/formato'
import { variablesDesdeSeleccion } from '../utils/seleccionVariables'
import SelectorVariables from '../components/SelectorVariables'
import { useToast } from '../components/Toast'

let contadorLocal = 0
function nuevoId() {
  contadorLocal += 1
  return contadorLocal
}

function crearModelo(nombre) {
  return { id: nuevoId(), nombre, tipoTrailerId: '', seleccionadas: {} }
}

/**
 * Permite armar varias configuraciones (distintos modelos/variables) y ver
 * los resultados uno al lado del otro, para facilitarle la comparación al cliente.
 */
export default function Comparativa() {
  const showToast = useToast()
  const tipos = useLiveQuery(() => db.tiposTrailer.toArray(), []) ?? []
  const variables = useLiveQuery(() => db.variables.toArray(), []) ?? []
  const [redondeo, setRedondeoLocal] = useState(1)

  const [modelos, setModelos] = useState(() => [crearModelo('Opción 1'), crearModelo('Opción 2')])

  useEffect(() => {
    getRedondeo().then(setRedondeoLocal)
  }, [])

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

  function cambiarCantidad(modeloId, variableId, valor) {
    const cantidad = Math.max(1, Math.floor(Number(valor)) || 1)
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
      showToast('Completá al menos un modelo con tipo de trailer para exportar', 'error')
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
        valoresVariables
      }
    })
    await generarPdfComparativa({
      fecha: new Date().toISOString(),
      variablesInfo: variablesEnUso.map(v => ({ id: v.id, nombre: v.nombre, esOpcional: !!v.esOpcional })),
      columnas
    })
  }

  return (
    <div className="page page-comparativa">
      <h2 className="titulo-pagina">Comparativa de modelos</h2>
      <p className="texto-ayuda">
        Armá dos o más configuraciones (distinto tipo de trailer y/o variables) y
        compará los resultados lado a lado para mostrárselos al cliente.
      </p>

      <div className="comparativa-modelos">
        {modelos.map(m => (
          <TarjetaModelo
            key={m.id}
            modelo={m}
            tipos={tipos}
            variables={variables}
            onCambiarNombre={nombre => actualizarModelo(m.id, { nombre })}
            onCambiarTipo={tipoTrailerId => actualizarModelo(m.id, { tipoTrailerId })}
            onToggleVariable={variableId => toggleVariable(m.id, variableId)}
            onCantidadChange={(variableId, valor) => cambiarCantidad(m.id, variableId, valor)}
            onEliminar={modelos.length > 1 ? () => eliminarModelo(m.id) : null}
          />
        ))}
      </div>

      <div className="form-inline">
        <button className="btn-secundario" onClick={agregarModelo}>+ Agregar modelo</button>
      </div>

      {hayAlgoParaComparar && (
        <div className="resultado">
          <div className="resultado-cabecera">
            <h3>Comparación</h3>
            <button className="btn-secundario" onClick={descargarComparativaPdf}>Descargar PDF</button>
          </div>
          <div className="tabla-comparativa-wrapper">
            <table className="tabla-comparativa">
              <thead>
                <tr>
                  <th>Modelo</th>
                  {filasComparativa.map(f => (
                    <th key={f.modelo.id}>{f.modelo.nombre || 'Sin nombre'}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Tipo de trailer</td>
                  {filasComparativa.map(f => (
                    <td key={f.modelo.id}>{f.tipoTrailer?.nombre ?? '—'}</td>
                  ))}
                </tr>
                <tr>
                  <td>Precio estándar</td>
                  {filasComparativa.map(f => (
                    <td key={f.modelo.id} className={f.resultado ? 'price-num' : ''}>{f.resultado ? formatoARS.format(f.precioEstandar) : '—'}</td>
                  ))}
                </tr>
                {variablesEnUso.map(v => (
                  <tr key={v.id}>
                    <td>{v.nombre}</td>
                    {filasComparativa.map(f => {
                      const seleccionada = f.variablesSeleccionadas.find(sv => sv.id === v.id)
                      if (v.esOpcional) {
                        const detalleItem = f.resultado?.detalle.find(d => d.id === v.id)
                        return (
                          <td key={f.modelo.id} className={detalleItem ? 'price-num' : ''}>{detalleItem ? formatoARS.format(detalleItem.monto) : '—'}</td>
                        )
                      }
                      return (
                        <td key={f.modelo.id}>
                          {seleccionada
                            ? (seleccionada.cantidad > 1 ? `Sí (x${seleccionada.cantidad})` : 'Sí')
                            : '—'}
                        </td>
                      )
                    })}
                  </tr>
                ))}
                <tr className="fila-total">
                  <td>Total</td>
                  {filasComparativa.map(f => (
                    <td key={f.modelo.id} className={f.resultado ? 'price-num' : ''}>
                      {f.resultado ? (
                        <>
                          <strong>{formatoARS.format(f.resultado.precioFinal)}</strong> <span className="nota-iva">{NOTA_IVA}</span>
                        </>
                      ) : '—'}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function TarjetaModelo({ modelo, tipos, variables, onCambiarNombre, onCambiarTipo, onToggleVariable, onCantidadChange, onEliminar }) {
  return (
    <div className="tarjeta-modelo">
      <div className="form-inline">
        <input
          placeholder="Nombre del modelo (ej: Opción A)"
          value={modelo.nombre}
          onChange={e => onCambiarNombre(e.target.value)}
        />
        {onEliminar && (
          <button className="btn-peligro" onClick={onEliminar} type="button">Quitar</button>
        )}
      </div>

      <label className="campo">
        Tipo de trailer
        <select value={modelo.tipoTrailerId} onChange={e => onCambiarTipo(e.target.value)}>
          <option value="">Seleccionar...</option>
          {tipos.map(t => (
            <option key={t.id} value={t.id}>{t.nombre} — {formatoARS.format(t.precioBase)}</option>
          ))}
        </select>
      </label>

      <SelectorVariables
        variables={variables}
        seleccionadas={modelo.seleccionadas}
        onToggle={onToggleVariable}
        onCantidadChange={onCantidadChange}
      />
    </div>
  )
}
