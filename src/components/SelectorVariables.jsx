import { useMemo, useState } from 'react'
import { formatoARS } from '../utils/formato'

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
export default function SelectorVariables({ variables, seleccionadas, onToggle, onCantidadChange }) {
  const [busqueda, setBusqueda] = useState('')

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
    () => [...new Set(variablesFiltradas.map(v => v.categoria))].sort((a, b) => a.localeCompare(b, 'es')),
    [variablesFiltradas]
  )

  return (
    <div className="selector-variables">
      <input
        className="buscador-variables"
        placeholder="Buscar variable..."
        value={busqueda}
        onChange={e => setBusqueda(e.target.value)}
      />

      {busqueda && categorias.length === 0 && (
        <p className="texto-ayuda">Sin resultados para "{busqueda}".</p>
      )}

      {categorias.map(cat => (
        <fieldset key={cat} className="grupo-variables">
          <legend>{cat}</legend>
          {variablesFiltradas.filter(v => v.categoria === cat).map(v => {
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
                  <span className="modificador">
                    {v.tipoModificador === 'fijo'
                      ? `(${formatoARS.format(v.valor)})`
                      : `${v.valor >= 0 ? '+' : ''}${v.valor}%`}
                  </span>
                </label>
                {estaSeleccionada && v.permiteCantidad && (
                  <input
                    type="number"
                    min="1"
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
  )
}
