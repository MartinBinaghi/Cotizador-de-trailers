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
          <p>Ocurrió un error inesperado. Tus datos y el borrador de la cotización no se perdieron.</p>
          <button type="button" onClick={() => window.location.reload()}>
            Recargar la aplicación
          </button>
          <details className="texto-ayuda">
            <summary>Detalles técnicos</summary>
            {String(this.state.error?.message || this.state.error)}
          </details>
        </div>
      )
    }
    return this.props.children
  }
}
