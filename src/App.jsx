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

export default function App() {
  const [tab, setTab] = useState('cotizador')
  const [datosParaDuplicar, setDatosParaDuplicar] = useState(null)

  useEffect(() => {
    seedIfEmpty()
  }, [])

  function handleDuplicar(datos) {
    setDatosParaDuplicar(datos)
    setTab('cotizador')
  }

  return (
    <ToastProvider>
      <div className="app">
        <header className="app-header">
          <h1>Cotizador de Trailers</h1>
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
