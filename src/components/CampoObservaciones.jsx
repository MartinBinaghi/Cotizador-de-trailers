const MAX_PALABRAS = 300

function contarPalabras(texto) {
  const limpio = texto.trim()
  return limpio ? limpio.split(/\s+/).length : 0
}

/** Campo de observaciones con tope de 300 palabras, compartido entre Cotizador y Comparativa. */
export default function CampoObservaciones({ value, onChange }) {
  function handleChange(e) {
    let texto = e.target.value
    if (contarPalabras(texto) > MAX_PALABRAS) {
      texto = texto.trim().split(/\s+/).slice(0, MAX_PALABRAS).join(' ')
    }
    onChange(texto)
  }

  return (
    <label className="campo">
      Observaciones (opcional)
      <textarea
        rows={4}
        value={value}
        onChange={handleChange}
        placeholder="Notas o aclaraciones para el cliente..."
      />
      <span className="texto-ayuda">{contarPalabras(value)} / {MAX_PALABRAS} palabras</span>
    </label>
  )
}
