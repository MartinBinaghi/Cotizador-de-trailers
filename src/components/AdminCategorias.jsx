import { useEffect, useState } from 'react'
import { claseDe, nombreClase } from '../utils/clasesProductos'
import { guardarCategoria } from '../db/catalogo'
import { ordenar } from '../utils/ordenar'
import SelectorClase from './SelectorClase'
import SelectorOrden from './SelectorOrden'
import Inspector from './Inspector'
import { useToast } from './Toast'

export default function AdminCategorias({ categorias, claseId, clases, orden, setOrden, nuevo }) {
  const [seleccion, setSeleccion] = useState(null)
  useEffect(() => setSeleccion(null), [nuevo])
  const actual = categorias.find(c => c.id === seleccion) ?? null

  return (
    <div className="maestro-detalle">
      <section className="panel">
        <div className="panel-cabecera">
          <h2 className="panel-titulo">Categorías</h2>
          <SelectorOrden value={orden} onChange={setOrden} />
        </div>
        <p className="panel-nota">Cada categoría admite variables de su clase. Las categorías Universal admiten variables de cualquier clase.</p>
        {categorias.length === 0 ? (
          <p className="panel-vacio">Todavía no hay categorías en esta clase.</p>
        ) : (
          <div className="tabla-scroll">
            <table className="tabla tabla-catalogo">
              <thead>
                <tr>
                  <th scope="col">Nombre</th>
                  <th scope="col">Clase</th>
                  <th scope="col">Tipo</th>
                </tr>
              </thead>
              <tbody>
                {ordenar(categorias, orden).map(cat => (
                  <tr key={cat.id} className={cat.id === seleccion ? 'seleccionada' : undefined} onClick={() => setSeleccion(cat.id)}>
                    <td><button type="button" className="btn-fila" onClick={() => setSeleccion(cat.id)}>{cat.nombre}</button></td>
                    <td><span className="etiqueta-clase">{nombreClase(clases, claseDe(cat))}</span></td>
                    <td className="texto-suave">{cat.esDescuento ? 'Descuento' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <FormCategoria
        key={actual?.id ?? `nuevo-${nuevo}`}
        categoria={actual}
        claseId={claseId}
        clases={clases}
        enfocar={nuevo > 0 && !actual}
        onCerrar={() => setSeleccion(null)}
      />
    </div>
  )
}

function FormCategoria({ categoria, claseId, clases, enfocar, onCerrar }) {
  const vacia = { nombre: '', claseId, esDescuento: false }
  const [datos, setDatos] = useState(() => categoria ? { ...categoria, claseId: claseDe(categoria) } : vacia)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)
  const showToast = useToast()

  async function guardar(e) {
    e.preventDefault()
    if (!datos.nombre.trim()) { setError('El nombre de la categoría es obligatorio.'); return }
    setGuardando(true)
    try {
      await guardarCategoria(datos)
      showToast('Categoría guardada')
      if (categoria) onCerrar()
      else setDatos(vacia)
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Inspector
      titulo={categoria ? categoria.nombre : 'Nueva categoría'}
      onSubmit={guardar}
      onCancelar={categoria ? onCerrar : null}
      error={error}
      guardando={guardando}
      textoGuardar={categoria ? 'Guardar' : 'Agregar categoría'}
    >
      <label className="campo">
        Nombre de categoría
        <input autoFocus={enfocar} value={datos.nombre} onChange={e => { setDatos({ ...datos, nombre: e.target.value }); setError(null) }} />
      </label>
      <SelectorClase clases={clases} value={datos.claseId} onChange={valor => { setDatos({ ...datos, claseId: valor }); setError(null) }} />
      <label className="checkbox-inline">
        <input type="checkbox" checked={!!datos.esDescuento} onChange={e => setDatos({ ...datos, esDescuento: e.target.checked })} />
        Es de descuento
      </label>
    </Inspector>
  )
}
