import { CLASE_UNIVERSAL } from '../utils/clasesProductos'

export default function SelectorClase({ clases, value, onChange, disabled = false, label = 'Clase de producto' }) {
  return (
    <label className="campo selector-clase">
      {label}
      <select value={value} onChange={e => onChange(e.target.value)} disabled={disabled}>
        {clases.map(clase => (
          <option key={clase.id} value={clase.id}>
            {clase.nombre}{clase.id === CLASE_UNIVERSAL ? ' (todas las clases)' : ''}
          </option>
        ))}
      </select>
    </label>
  )
}
