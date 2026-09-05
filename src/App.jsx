import { useState, useEffect } from 'react'
import { db, seedIfEmpty } from './db/database'
import EspacioClase from './components/EspacioClase'
import { claseDe, CLASE_UNIVERSAL, CLASE_TRAILERS } from './utils/clasesProductos'
import { ToastProvider } from './components/Toast'
import ErrorBoundary from './components/ErrorBoundary'
import Cotizador from './pages/Cotizador'
import Admin from './pages/Admin'
import Historial from './pages/Historial'
import Comparativa from './pages/Comparativa'
import './App.css'

const TABS = {
  cotizador: { label: 'Cotizador' },
  comparativa: { label: 'Comparativa' },
  admin: { label: 'Catálogo' },
  historial: { label: 'Historial' }
}

function temaInicial() {
  const guardado = localStorage.getItem('tema')
  if (guardado === 'claro' || guardado === 'oscuro') return guardado
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro'
}

export default function App() {
  const [tab, setTab] = useState('cotizador')
  const [datosParaDuplicar, setDatosParaDuplicar] = useState(null)
  const [tema, setTema] = useState(temaInicial)

  useEffect(() => {
    // Datos de ejemplo solo en desarrollo: la app instalada arranca vacía
    if (import.meta.env.DEV) seedIfEmpty()
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = tema === 'oscuro' ? 'dark' : 'light'
    localStorage.setItem('tema', tema)
  }, [tema])

  function alternarTema() {
    setTema(prev => (prev === 'oscuro' ? 'claro' : 'oscuro'))
  }

  async function handleDuplicar(datos) {
    const tipo = datos.tipoTrailerId == null ? null : await db.tiposTrailer.get(datos.tipoTrailerId)
    const candidata = tipo && claseDe(tipo) !== CLASE_UNIVERSAL
      ? claseDe(tipo) : (datos.claseEliminada ? CLASE_UNIVERSAL : datos.claseId ?? CLASE_TRAILERS)
    const claseId = await db.clasesProductos.get(candidata) ? candidata : CLASE_UNIVERSAL
    await db.config.put({ clave: 'claseSeleccionada:cotizador', valor: claseId })
    setDatosParaDuplicar({ ...datos, claseId, tipoTrailerId: tipo?.id ?? '' })
    setTab('cotizador')
  }

  return (
    <ToastProvider>
      <div className="app">
        <header className="app-header">
          <div className="brand">
            <img src="/logo.png" alt="BINA Maquinarias" />
            <div className="brand-text">
              <strong>BINA Maquinarias</strong>
              <span>Cotizador de productos</span>
            </div>
          </div>
          <div className="app-header-derecha">
            <nav>
              {Object.entries(TABS).map(([key, { label }]) => (
                <button
                  key={key}
                  className={key === tab ? 'activo' : ''}
                  onClick={() => setTab(key)}
                >
                  {label}
                </button>
              ))}
            </nav>
            <button
              type="button"
              className="btn-tema"
              onClick={alternarTema}
              aria-label={tema === 'oscuro' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
              title={tema === 'oscuro' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            >
              {tema === 'oscuro' ? '☀️' : '🌙'}
            </button>
          </div>
        </header>
        <main>
          {/* key={tab}: si una pestaña rompe, cambiar de pestaña resetea el boundary
              y el resto de la app (header/nav) sigue funcionando */}
          <ErrorBoundary key={tab}>
            {tab === 'cotizador' && (
              <EspacioClase pantalla="cotizador" borrador="borradorCotizador">
              {({ claseId, clases }) => <Cotizador
                claseId={claseId}
                clases={clases}
                datosIniciales={datosParaDuplicar}
                onConsumirDatosIniciales={() => setDatosParaDuplicar(null)}
              />}
              </EspacioClase>
            )}
            {tab === 'comparativa' && <EspacioClase pantalla="comparativa" borrador="borradorComparativa">
              {props => <Comparativa {...props} />}
            </EspacioClase>}
            {tab === 'admin' && <EspacioClase pantalla="catalogo">
              {props => <Admin {...props} />}
            </EspacioClase>}
            {tab === 'historial' && <Historial onDuplicar={handleDuplicar} />}
          </ErrorBoundary>
        </main>
      </div>
    </ToastProvider>
  )
}
