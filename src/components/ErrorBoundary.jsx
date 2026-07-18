import { Component } from 'react'

/**
 * Evita la pantalla en blanco si algo lanza durante el render: muestra el
 * error y un botón para recargar. Los datos no corren riesgo (viven en
 * IndexedDB) y el borrador del cotizador también se conserva.
 */
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="panel-vacio" role="alert">
          <p>Ocurrió un error inesperado.</p>
          <p className="texto-ayuda">{String(this.state.error?.message || this.state.error)}</p>
          <button type="button" onClick={() => window.location.reload()}>
            Recargar la aplicación
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
