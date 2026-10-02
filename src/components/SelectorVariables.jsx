import { useId, useMemo, useState } from 'react'
import { formatoARS } from '../utils/formato'
import { claseDe, nombreClase } from '../utils/clasesProductos'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/database'
import { compararPor } from '../utils/ordenar'

/**
 * Tabla de variables agrupadas por categoría (A-Z), con buscador; dentro de
 * cada categoría se ordenan según `orden` (ver utils/ordenar).
 * Las variables con `permiteCantidad` muestran un input numérico cuando están
 * seleccionadas (ej: cantidad de frenos, llantas, cubiertas, etc.).
 * `children` se dibuja en la fila de filtros, junto al buscador (ej: el tipo de producto).
 *
 * @param {object} props
 * @param {Array} props.variables catálogo completo de variables
 * @param {{[id: number]: number}} props.seleccionadas mapa variableId -> cantidad
 * @param {(id: number) => void} props.onToggle
 * @param {(id: number, cantidad: string|number) => void} props.onCantidadChange
 */
export default function SelectorVariables({ variables, clases = [], seleccionadas, onToggle, onCantidadChange, orden, children }) {
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
    return [...base].sort(compararPor(orden))
  }, [variables, busqueda, orden])

  const categorias = useMemo(
    () => [...new Map(variablesFiltradas.map(v => [v.categoriaId ?? v.categoria, {
      id: v.categoriaId ?? v.categoria, nombre: v.categoria
    }])).values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [variablesFiltradas]
  )

  return (
    <div className="selector-variables">
      <div className="fila-filtros">
        {children}
        <label className="campo" htmlFor={busquedaId}>
          Buscar variable
          <input
            id={busquedaId}
            type="search"
            placeholder="Nombre o categoría"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
          />
        </label>
      </div>

      {busqueda && categorias.length === 0 && (
        <p className="texto-ayuda">Sin resultados para "{busqueda}".</p>
      )}
      {!busqueda && variables.length === 0 && (
        <p className="texto-ayuda">No hay variables cargadas en esta clase.</p>
      )}

      {categorias.length > 0 && (
        <div className="tabla-scroll">
          <table className="tabla tabla-variables">
            <thead>
              <tr>
                <th scope="col">Variable</th>
                <th scope="col" className="col-num col-cantidad">Cant.</th>
                <th scope="col" className="col-num">Importe</th>
              </tr>
            </thead>
            {categorias.map(cat => (
              <tbody key={cat.id}>
                <tr className="fila-grupo">
                  <th scope="colgroup" colSpan={3}>
                    {cat.nombre}{' '}
                    <span className="etiqueta-clase">
                      {nombreClase(clases, claseDe(registrosCategorias.find(c => c.id === cat.id) ?? {}))}
                    </span>
                  </th>
                </tr>
                {variablesFiltradas.filter(v => (v.categoriaId ?? v.categoria) === cat.id).map(v => {
                  const estaSeleccionada = Object.prototype.hasOwnProperty.call(seleccionadas, v.id)
                  const conCantidad = estaSeleccionada && v.permiteCantidad && v.tipoModificador === 'fijo'
                  return (
                    <tr key={v.id} className={estaSeleccionada ? 'seleccionada' : undefined}>
                      <td>
                        <label className="celda-check">
                          <input
                            type="checkbox"
                            checked={estaSeleccionada}
                            onChange={() => onToggle(v.id)}
                          />
                          <span>{v.nombre}</span>{' '}
                          <span className="etiqueta-clase">{nombreClase(clases, claseDe(v))}</span>
                        </label>
                      </td>
                      <td className="col-num col-cantidad">
                        {conCantidad ? (
                          <input
                            type="number"
                            min="1"
                            max="999"
                            className="input-cantidad"
                            value={seleccionadas[v.id] ?? 1}
                            onChange={e => onCantidadChange(v.id, e.target.value)}
                            aria-label={`Cantidad de ${v.nombre}`}
                          />
                        ) : <span className="texto-tenue">—</span>}
                      </td>
                      <td className="col-num price-num">
                        {v.tipoModificador === 'fijo'
                          ? formatoARS.format(v.valor)
                          : `${v.valor >= 0 ? '+' : '−'}${Math.abs(v.valor)} %`}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            ))}
          </table>
        </div>
      )}
    </div>
  )
}
