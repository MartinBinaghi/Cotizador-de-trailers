import { useState, useEffect } from 'react'
import { seedIfEmpty } from './db/database'
import { ToastProvider } from './components/Toast'
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
    seedIfEmpty()
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = tema === 'oscuro' ? 'dark' : 'light'
    localStorage.setItem('tema', tema)
  }, [tema])

  function alternarTema() {
    setTema(prev => (prev === 'oscuro' ? 'claro' : 'oscuro'))
  }

  function handleDuplicar(datos) {
    setDatosParaDuplicar(datos)
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
              <span>Cotizador de Trailers</span>
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
          {tab === 'cotizador' && (
            <Cotizador
              datosIniciales={datosParaDuplicar}
              onConsumirDatosIniciales={() => setDatosParaDuplicar(null)}
            />
          )}
          {tab === 'comparativa' && <Comparativa />}
          {tab === 'admin' && <Admin />}
          {tab === 'historial' && <Historial onDuplicar={handleDuplicar} />}
        </main>
      </div>
    </ToastProvider>
  )
}
