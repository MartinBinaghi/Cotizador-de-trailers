/**
 * Panel lateral del catálogo para dar de alta o editar un registro.
 * Con `onCancelar` está editando un registro existente; sin él, es un alta.
 */
export default function Inspector({ titulo, onSubmit, onCancelar, onEliminar, error, textoGuardar, guardando = false, children }) {
  return (
    <aside className="panel inspector" aria-label={titulo}>
      <div className="panel-cabecera">
        <h2 className="panel-titulo-grande">{titulo}</h2>
        <span className="texto-tenue">{onCancelar ? 'Editando' : 'Alta'}</span>
      </div>
      <form className="panel-cuerpo pila" onSubmit={onSubmit} noValidate>
        {children}
        {error && <p className="error-texto" role="alert">{error}</p>}
        <div className="inspector-acciones">
          {onEliminar
            ? <button type="button" className="btn-peligro" onClick={onEliminar}>Eliminar</button>
            : <span />}
          <div className="grupo-botones">
            {onCancelar && <button type="button" className="btn-secundario" onClick={onCancelar}>Cancelar</button>}
            <button type="submit" className="btn-solido" disabled={guardando}>{textoGuardar}</button>
          </div>
        </div>
      </form>
    </aside>
  )
}
