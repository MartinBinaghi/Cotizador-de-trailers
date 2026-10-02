import { useState } from 'react'
import { db } from '../db/database'
import { useToast } from './Toast'

export default function ExportarCatalogo() {
  const [exportando, setExportando] = useState(false)
  const showToast = useToast()

  async function exportar() {
    setExportando(true)
    try {
      const datos = await db.transaction('r', db.clasesProductos, db.tiposTrailer, db.categorias, db.variables, async () => ({
        clasesProductos: await db.clasesProductos.toArray(),
        tiposTrailer: await db.tiposTrailer.toArray(),
        categorias: await db.categorias.toArray(),
        variables: await db.variables.toArray()
      }))
      const [{ generarCatalogoExcel }, { guardarArchivo }] = await Promise.all([
        import('../utils/exportarCatalogoExcel'), import('../utils/guardarArchivo')
      ])
      const contenido = await generarCatalogoExcel(datos)
      const guardado = await guardarArchivo(contenido, {
        nombre: `catalogo-completo-${new Date().toISOString().slice(0, 10)}.xlsx`,
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        extension: 'xlsx', descripcion: 'Libro de Excel'
      })
      if (guardado) showToast('Catálogo exportado a Excel')
    } catch (err) {
      showToast(`No se pudo exportar el catálogo: ${err.message}`, 'error')
    } finally {
      setExportando(false)
    }
  }

  return (
    <button
      type="button"
      className="btn-secundario"
      onClick={exportar}
      disabled={exportando}
      title="Todas las clases, tipos de producto, categorías y variables en un libro de Excel"
    >
      {exportando ? 'Exportando…' : 'Exportar Excel'}
    </button>
  )
}
