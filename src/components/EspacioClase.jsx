import { useEffect, useId, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/database'
import { CLASE_TRAILERS, CLASE_UNIVERSAL } from '../utils/clasesProductos'
import SelectorClase from './SelectorClase'
import { useToast } from './Toast'

// Cada pantalla guarda su selección; cambiarla descarta únicamente su borrador.
export default function EspacioClase({ pantalla, borrador, children }) {
  const clases = useLiveQuery(() => db.clasesProductos.toArray(), [])
  const [claseId, setClaseId] = useState(null)
  const [cambiando, setCambiando] = useState(false)
  const [error, setError] = useState('')
  const [clasePendiente, setClasePendiente] = useState(null)
  const dialogo = useRef(null)
  const tituloDialogoId = useId()
  const descripcionDialogoId = useId()
  const showToast = useToast()
  const clave = `claseSeleccionada:${pantalla}`

  useEffect(() => {
    let vigente = true
    db.config.get(clave).then(registro => {
      if (vigente) setClaseId(registro?.valor ?? CLASE_TRAILERS)
    }).catch(() => {
      if (vigente) setError('No se pudo cargar la clase seleccionada. Volvé a abrir esta pantalla.')
    })
    return () => { vigente = false }
  }, [clave])

  useEffect(() => {
    if (clases && claseId && !clases.some(c => c.id === claseId)) setClaseId(CLASE_UNIVERSAL)
  }, [clases, claseId])

  useEffect(() => {
    if (clasePendiente) dialogo.current?.showModal()
    else dialogo.current?.close()
  }, [clasePendiente])

  async function cambiarClase(nuevaClase) {
    if (nuevaClase === claseId) return
    setCambiando(true)
    try {
      await db.transaction('rw', db.config, async () => {
        if (borrador) await db.config.delete(borrador)
        await db.config.put({ clave, valor: nuevaClase })
      })
      setClaseId(nuevaClase)
    } catch {
      showToast('No se pudo cambiar de clase. Intentá nuevamente.', 'error')
    } finally {
      setCambiando(false)
      setClasePendiente(null)
    }
  }

  if (error) return <p role="alert" className="error-texto">{error}</p>
  if (!clases || !claseId) return <p role="status">Cargando catálogo…</p>
  const claseActual = clases.some(c => c.id === claseId) ? claseId : CLASE_UNIVERSAL
  return (
    <div className="espacio-clase">
      <div className="barra-clase">
        <SelectorClase clases={clases} value={claseActual} onChange={valor => { if (valor !== claseActual) setClasePendiente(valor) }} disabled={cambiando} />
        <p className="texto-ayuda">Se muestran los datos de esta clase y los universales.</p>
      </div>
      <div key={claseActual} inert={cambiando ? '' : undefined}>
        {children({ claseId: claseActual, clases })}
      </div>
      <dialog ref={dialogo} className="dialogo-clase" aria-labelledby={tituloDialogoId} aria-describedby={descripcionDialogoId}
        onCancel={e => { e.preventDefault(); if (!cambiando) setClasePendiente(null) }}>
        <h3 id={tituloDialogoId}>Cambiar a {clases.find(c => c.id === clasePendiente)?.nombre}</h3>
        <p id={descripcionDialogoId}>{borrador
          ? 'Se vaciará el borrador de esta pantalla: cliente, configuración, imágenes y observaciones. Las cotizaciones guardadas se conservan.'
          : 'Se descartarán los cambios sin guardar de los formularios del catálogo.'}</p>
        <div className="form-inline">
          <button type="button" className="btn-secundario" autoFocus disabled={cambiando} onClick={() => setClasePendiente(null)}>Cancelar</button>
          <button type="button" disabled={cambiando} onClick={() => cambiarClase(clasePendiente)}>
            {cambiando ? 'Cambiando…' : 'Confirmar cambio de clase'}
          </button>
        </div>
      </dialog>
    </div>
  )
}
