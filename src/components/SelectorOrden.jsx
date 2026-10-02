import { OPCIONES_ORDEN } from '../utils/ordenar'

export default function SelectorOrden({ value, onChange }) {
  return (
    <label className="selector-compacto">
      Ordenar por
      <select value={value} onChange={e => onChange(e.target.value)}>
        {OPCIONES_ORDEN.map(([valor, texto]) => (
          <option key={valor} value={valor}>{texto}</option>
        ))}
      </select>
    </label>
  )
}
