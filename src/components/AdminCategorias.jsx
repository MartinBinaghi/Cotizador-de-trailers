import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/database'
import { claseDe, nombreClase, perteneceAClase } from '../utils/clasesProductos'
import { guardarCategoria } from '../db/catalogo'
import SelectorClase from './SelectorClase'
import { useToast } from './Toast'

export default function AdminCategorias({ claseId, clases }) {
  const categorias = useLiveQuery(() => db.categorias.filter(c => perteneceAClase(c, claseId)).toArray(), [claseId]) ?? []
  const vacia = () => ({ nombre: '', claseId, esDescuento: false })
  const [nueva, setNueva] = useState(vacia)
  const [edicion, setEdicion] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const showToast = useToast()

  async function guardar(datos) {
    if (!datos.nombre.trim()) { showToast('El nombre de la categoría es obligatorio.', 'error'); return }
    setGuardando(true)
    try {
      await guardarCategoria(datos)
      if (datos.id) setEdicion(null)
      else setNueva(vacia())
      showToast('Categoría guardada')
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setGuardando(false)
    }
  }

  function campos(datos, setDatos) {
    return <>
      <label className="campo">Nombre de categoría
        <input value={datos.nombre} onChange={e => setDatos({ ...datos, nombre: e.target.value })} required />
      </label>
      <SelectorClase clases={clases} value={datos.claseId} onChange={valor => setDatos({ ...datos, claseId: valor })} />
      <label className="checkbox-inline">
        <input type="checkbox" checked={datos.esDescuento} onChange={e => setDatos({ ...datos, esDescuento: e.target.checked })} />
        Es de descuento
      </label>
    </>
  }

  return (
    <section className="admin-seccion admin-seccion-ancha">
      <h3>Categorías</h3>
      <p className="texto-ayuda">Cada categoría admite variables de su clase. Las categorías Universal admiten variables de cualquier clase.</p>
      <ul className="lista-admin">
        {categorias.map(cat => <li key={cat.id}>
          {edicion?.id === cat.id ? <form className="form-inline" onSubmit={e => { e.preventDefault(); guardar(edicion) }}>
            {campos(edicion, setEdicion)}
            <button disabled={guardando}>Guardar</button>
            <button type="button" className="btn-secundario" onClick={() => setEdicion(null)}>Cancelar</button>
          </form> : <>
            <span>{cat.nombre} <span className="etiqueta-clase">{nombreClase(clases, claseDe(cat))}</span></span>
            {cat.esDescuento && <span>Descuento</span>}
            <button className="btn-secundario" onClick={() => setEdicion({ ...cat })}>Editar categoría</button>
          </>}
        </li>)}
      </ul>
      <form className="form-inline" onSubmit={e => { e.preventDefault(); guardar(nueva) }}>
        {campos(nueva, setNueva)}
        <button disabled={guardando}>Agregar categoría</button>
      </form>
    </section>
  )
}
