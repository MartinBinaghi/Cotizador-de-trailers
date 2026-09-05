import { useEffect, useId, useRef, useState } from 'react'
import { db } from '../db/database'
import { normalizarNombre, CLASE_UNIVERSAL } from '../utils/clasesProductos'
import { eliminarClase, resumirClase } from '../db/eliminarClase'
import { useToast } from './Toast'

export default function AdminClases({ clases }) {
  const [nombre, setNombre] = useState('')
  const [guardando, setGuardando] = useState(false)
  const showToast = useToast()
  const [pendiente, setPendiente] = useState(null)
  const [eliminando, setEliminando] = useState(false)
  const [error, setError] = useState('')
  const dialogo = useRef(null)
  const tituloId = useId()
  const descripcionId = useId()

  useEffect(() => {
    if (pendiente) dialogo.current?.showModal()
    else dialogo.current?.close()
  }, [pendiente])

  async function pedirEliminar(clase) {
    try {
      const resumen = await resumirClase(clase.id)
      setError('')
      setPendiente({ ...clase, resumen })
    } catch (err) { showToast(err.message, 'error') }
  }

  async function confirmarEliminar() {
    setEliminando(true)
    try {
      await eliminarClase(pendiente.id)
      setPendiente(null)
      showToast('Clase y datos del catálogo eliminados')
    } catch (err) { setError(err.message) }
    finally { setEliminando(false) }
  }

  async function agregar(e) {
    e.preventDefault()
    if (!nombre.trim()) return
    setGuardando(true)
    try {
      await db.transaction('rw', db.clasesProductos, async () => {
        const existentes = await db.clasesProductos.toArray()
        if (existentes.some(c => normalizarNombre(c.nombre) === normalizarNombre(nombre))) {
          throw new Error('Ya existe una clase con ese nombre.')
        }
        await db.clasesProductos.add({ id: crypto.randomUUID(), nombre: nombre.trim() })
      })
      setNombre('')
      showToast('Clase de producto creada')
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <section className="admin-seccion admin-seccion-ancha">
      <h3>Clases de productos</h3>
      <p className="texto-ayuda">Universal habilita un dato para todas las clases, incluidas las que crees después.</p>
      <ul className="lista-admin">{clases.map(c => <li key={c.id}>
        <span>{c.nombre}</span>
        {c.id === CLASE_UNIVERSAL ? <span className="texto-ayuda">No se puede eliminar</span> :
          <button type="button" className="btn-peligro" onClick={() => pedirEliminar(c)} aria-label={`Eliminar clase ${c.nombre}`}>Eliminar clase</button>}
      </li>)}</ul>
      <form className="form-inline" onSubmit={agregar}>
        <label className="campo">Nueva clase
          <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Carrocerías" required />
        </label>
        <button disabled={guardando}>{guardando ? 'Creando…' : 'Crear clase'}</button>
      </form>
      <dialog ref={dialogo} className="dialogo-clase" aria-labelledby={tituloId} aria-describedby={descripcionId}
        onCancel={e => { e.preventDefault(); if (!eliminando) setPendiente(null) }}>
        <h3 id={tituloId}>Eliminar clase {pendiente?.nombre}</h3>
        <p id={descripcionId}>Se eliminarán esta clase y todos sus datos: tipos de producto ({pendiente?.resumen.tipos}),
          {' '}categorías ({pendiente?.resumen.categorias}) y variables ({pendiente?.resumen.variables}).
          También se vaciarán los borradores de esta clase. Esta acción no se puede deshacer.</p>
        <p>Se conservan el historial de cotizaciones y los datos Universal. Las pantallas que usaban esta clase pasarán a Universal.</p>
        {error && <p className="error-texto" role="alert">{error}</p>}
        <div className="form-inline">
          <button type="button" className="btn-secundario" autoFocus disabled={eliminando} onClick={() => setPendiente(null)}>Cancelar</button>
          <button type="button" className="btn-peligro" disabled={eliminando} onClick={confirmarEliminar}>
            {eliminando ? 'Eliminando…' : 'Eliminar clase y sus datos'}
          </button>
        </div>
      </dialog>
    </section>
  )
}
