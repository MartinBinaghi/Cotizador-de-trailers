import { useState, useEffect, useMemo } from 'react'
import { db, seedIfEmpty } from './db/database'
import EspacioClase from './components/EspacioClase'
import { claseDe, CLASE_UNIVERSAL, CLASE_TRAILERS } from './utils/clasesProductos'
import { ToastProvider } from './components/Toast'
import ErrorBoundary from './components/ErrorBoundary'
import Cotizador from './pages/Cotizador'
import Admin from './pages/Admin'
import Historial from './pages/Historial'
import Comparativa from './pages/Comparativa'
import { ShellContext } from './components/Shell'
import { version } from '../package.json'
import './App.css'

const TABS = {
  cotizador: { label: 'Cotizador', icono: 'M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8 7h8M8 11h8M8 15h5' },
  comparativa: { label: 'Comparativa', icono: 'M4 4h6v16H4zM14 4h6v16h-6z' },
  admin: { label: 'Catálogo', icono: 'M4 6h16M4 12h16M4 18h10' },
  historial: { label: 'Historial', icono: 'M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16zM12 8v4l3 2' }
}

const ICONO_LUNA = 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z'
const ICONO_SOL = 'M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4'

function temaInicial() {
  const guardado = localStorage.getItem('tema')
  if (guardado === 'claro' || guardado === 'oscuro') return guardado
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro'
}

export default function App() {
  const [tab, setTab] = useState('cotizador')
  const [datosParaDuplicar, setDatosParaDuplicar] = useState(null)
  const [tema, setTema] = useState(temaInicial)
  const [zonaClase, setZonaClase] = useState(null)
  const [zonaEstado, setZonaEstado] = useState(null)
  const zonas = useMemo(() => ({ clase: zonaClase, estado: zonaEstado }), [zonaClase, zonaEstado])

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
      <ShellContext.Provider value={zonas}>
      <div className="app">
        <header className="barra-titulo">
          <div className="marca">
            <img src="/logo.png" alt="BINA Maquinarias" />
            <span className="marca-separador" />
            <span className="marca-producto">Cotizador de productos</span>
          </div>
          <div className="barra-titulo-derecha">
            <span className="indicador-local"><span className="indicador-punto" />Base de datos local</span>
            <button
              type="button"
              className="btn-tema"
              onClick={alternarTema}
              aria-label={tema === 'oscuro' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
              title={tema === 'oscuro' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            >
              <Icono d={tema === 'oscuro' ? ICONO_SOL : ICONO_LUNA} />
            </button>
          </div>
        </header>
        <div className="app-cuerpo">
          <nav className="barra-lateral" aria-label="Secciones">
            <div className="barra-lateral-items">
              {Object.entries(TABS).map(([key, { label, icono }]) => (
                <button
                  key={key}
                  type="button"
                  className="item-lateral"
                  aria-current={key === tab ? 'page' : undefined}
                  onClick={() => setTab(key)}
                >
                  <Icono d={icono} />
                  {label}
                </button>
              ))}
            </div>
            <div ref={setZonaClase} className="barra-lateral-clase" />
          </nav>
          <main className="app-contenido">
            {/* key={tab}: si una pestaña rompe, cambiar de pestaña resetea el boundary
                y el resto de la ventana sigue funcionando */}
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
        <footer className="barra-estado">
          <div ref={setZonaEstado} className="barra-estado-zona" />
          <span className="barra-estado-version">v{version}</span>
        </footer>
      </div>
      </ShellContext.Provider>
    </ToastProvider>
  )
}

function Icono({ d }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}
