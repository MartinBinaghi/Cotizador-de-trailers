import { useId, useMemo, useState } from 'react'
import { formatoARS } from '../utils/formato'
import { claseDe, nombreClase } from '../utils/clasesProductos'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/database'

/**
 * Lista de variables agrupadas por categoría, con buscador y orden alfabético.
 * Las variables con `permiteCantidad` muestran un input numérico cuando están
 * seleccionadas (ej: cantidad de frenos, llantas, cubiertas, etc.).
 *
 * @param {object} props
 * @param {Array} props.variables catálogo completo de variables
 * @param {{[id: number]: number}} props.seleccionadas mapa variableId -> cantidad
 * @param {(id: number) => void} props.onToggle
 * @param {(id: number, cantidad: string|number) => void} props.onCantidadChange
 */
export default function SelectorVariables({ variables, clases = [], seleccionadas, onToggle, onCantidadChange }) {
  const [busqueda, setBusqueda] = useState('')
  const busquedaId = useId()
  const registrosCategorias = useLiveQuery(() => db.categorias.toArray(), []) ?? []

  const variablesFiltradas = useMemo(() => {
    const termino = busqueda.trim().toLowerCase()
    const base = termino
      ? variables.filter(v =>
          v.nombre.toLowerCase().includes(termino) || v.categoria.toLowerCase().includes(termino)
        )
      : variables
    return [...base].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  }, [variables, busqueda])

  const categorias = useMemo(
    () => [...new Map(variablesFiltradas.map(v => [v.categoriaId ?? v.categoria, {
      id: v.categoriaId ?? v.categoria, nombre: v.categoria
    }])).values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [variablesFiltradas]
  )

  return (
    <div className="selector-variables">
      <label className="campo-oculto" htmlFor={busquedaId}>Buscar variable</label>
      <input
        id={busquedaId}
        className="buscador-variables"
        placeholder="Buscar variable..."
        value={busqueda}
        onChange={e => setBusqueda(e.target.value)}
      />

      {busqueda && categorias.length === 0 && (
        <p className="texto-ayuda">Sin resultados para "{busqueda}".</p>
      )}

      <div className="grupos-variables">
      {categorias.map(cat => (
        <fieldset key={cat.id} className="grupo-variables">
          <legend>{cat.nombre}{' '}
            <span className="etiqueta-clase">
              {nombreClase(clases, claseDe(registrosCategorias.find(c => c.id === cat.id) ?? {}))}
            </span>
          </legend>
          {variablesFiltradas.filter(v => (v.categoriaId ?? v.categoria) === cat.id).map(v => {
            const estaSeleccionada = Object.prototype.hasOwnProperty.call(seleccionadas, v.id)
            const cantidad = seleccionadas[v.id] ?? 1
            return (
              <div key={v.id} className="checkbox-variable">
                <label>
                  <input
                    type="checkbox"
                    checked={estaSeleccionada}
                    onChange={() => onToggle(v.id)}
                  />
                  {v.nombre}{' '}
                  <span className="etiqueta-clase">{nombreClase(clases, claseDe(v))}</span>{' '}
                  <span className="modificador">
                    {v.tipoModificador === 'fijo'
                      ? `(${formatoARS.format(v.valor)})`
                      : `${v.valor >= 0 ? '+' : ''}${v.valor}%`}
                  </span>
                </label>
                {estaSeleccionada && v.permiteCantidad && v.tipoModificador === 'fijo' && (
                  <input
                    type="number"
                    min="1"
                    max="999"
                    className="input-cantidad"
                    value={cantidad}
                    onChange={e => onCantidadChange(v.id, e.target.value)}
                    aria-label={`Cantidad de ${v.nombre}`}
                  />
                )}
              </div>
            )
          })}
        </fieldset>
      ))}
      </div>
    </div>
  )
}
