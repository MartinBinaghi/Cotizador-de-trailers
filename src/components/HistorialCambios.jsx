import { useId, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/database'
import { deshacer, rehacer, volverA, MAX_PASOS } from '../db/historial'
import { useToast } from './Toast'
import Icono from './Icono'
import { fechaHora } from '../utils/formato'

const ICONO_DESHACER = 'M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11'
const ICONO_REHACER = 'm15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13'
const ICONO_HISTORIAL = 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2'

/** Botones ← → de la barra de título y el diálogo con el historial de cambios. */
export default function HistorialCambios() {
  const showToast = useToast()
  const dialogo = useRef(null)
  const tituloId = useId()
  const [ocupado, setOcupado] = useState(false)
  // Solo la parte liviana de cada paso (fecha, descripción, deshecho), la más nueva primero.
  const pasos = useLiveQuery(() => db.historial.reverse().toArray(), []) ?? []
  const actual = pasos.find(p => !p.deshecho)?.id
  const puedeRehacer = pasos.some(p => p.deshecho)

  async function ejecutar(accion, aviso) {
    setOcupado(true)
    try {
      const paso = await accion()
      if (!paso) return showToast('No hay cambios pendientes', 'info')
      showToast(`${aviso}: ${paso.descripcion}`)
      // Un aviso que no se va solo: el usuario tiene que saber qué quedó sin cambiar.
      if (paso.omitidos.length) alert(`Esto no se cambió, para no pisar datos más nuevos:\n\n• ${paso.omitidos.join('\n• ')}`)
    } catch (err) {
      showToast(`No se pudo aplicar el cambio: ${err.message}`, 'error')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="grupo-historial">
      <button type="button" className="btn-tema" disabled={ocupado || actual === undefined}
        onClick={() => ejecutar(() => deshacer(db), 'Se deshizo')} aria-label="Deshacer el último cambio" title="Deshacer el último cambio">
        <Icono d={ICONO_DESHACER} />
      </button>
      <button type="button" className="btn-tema" disabled={ocupado || !puedeRehacer}
        onClick={() => ejecutar(() => rehacer(db), 'Se rehízo')} aria-label="Rehacer" title="Rehacer">
        <Icono d={ICONO_REHACER} />
      </button>
      <button type="button" className="btn-tema" onClick={() => dialogo.current?.showModal()} aria-label="Historial de cambios" title="Historial de cambios">
        <Icono d={ICONO_HISTORIAL} />
      </button>
      <dialog ref={dialogo} className="dialogo dialogo-ancho" aria-labelledby={tituloId}>
        <h3 id={tituloId}>Historial de cambios</h3>
        <p>
          Los últimos {MAX_PASOS} cambios hechos en esta computadora al catálogo y a las cotizaciones.
          «Volver a este punto» deja los datos como estaban justo después de ese cambio; se puede volver a avanzar.
        </p>
        {pasos.length === 0 ? (
          <p className="texto-tenue">Todavía no hay cambios registrados.</p>
        ) : (
          <ul className="lista-filas lista-historial">
            {pasos.map(p => (
              <li key={p.id} className={p.deshecho ? 'paso-deshecho' : undefined}>
                <span>
                  <span className="texto-tenue price-num">{fechaHora(p.fecha)}</span>{' '}
                  {p.descripcion}
                  {p.deshecho ? <span className="texto-tenue"> (deshecho)</span> : null}
                </span>
                {p.id === actual ? <span className="etiqueta-clase">Estado actual</span> : (
                  <button type="button" className="btn-secundario btn-chico" disabled={ocupado}
                    onClick={() => ejecutar(async () => ({ ...p, omitidos: await volverA(db, p.id) }), 'Se volvió a')}>Volver a este punto</button>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="dialogo-acciones">
          <button type="button" className="btn-secundario" onClick={() => dialogo.current?.close()}>Cerrar</button>
        </div>
      </dialog>
    </div>
  )
}
