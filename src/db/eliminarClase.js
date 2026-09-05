import { db } from './database.js'
import { claseDe, CLASE_TRAILERS, CLASE_UNIVERSAL } from '../utils/clasesProductos.js'
import { calcularPrecioConGanancia } from '../utils/calcularPrecio.js'
import { normalizarSeleccionadas, variablesDesdeSeleccion } from '../utils/seleccionVariables.js'

export async function resumirClase(claseId) {
  return db.transaction('r', db.tiposTrailer, db.categorias, db.variables, async () => ({
    tipos: await db.tiposTrailer.filter(t => claseDe(t) === claseId).count(),
    categorias: await db.categorias.filter(c => claseDe(c) === claseId).count(),
    variables: await db.variables.filter(v => claseDe(v) === claseId).count()
  }))
}

export async function eliminarClase(claseId) {
  if (claseId === CLASE_UNIVERSAL) throw new Error('La clase Universal no se puede eliminar.')
  await db.transaction('rw', db.clasesProductos, db.tiposTrailer, db.categorias, db.variables, db.cotizaciones, db.config, async () => {
    const clase = await db.clasesProductos.get(claseId)
    if (!clase) throw new Error('La clase ya no existe.')
    const tipos = await db.tiposTrailer.filter(t => claseDe(t) === claseId).toArray()
    const categorias = await db.categorias.filter(c => claseDe(c) === claseId).toArray()
    const variables = await db.variables.toArray()
    const idsTipos = new Set(tipos.map(t => t.id))
    const idsCategorias = new Set(categorias.map(c => c.id))
    if (variables.some(v => idsCategorias.has(v.categoriaId) && claseDe(v) !== claseId)) {
      throw new Error('Hay variables de otra clase dentro de estas categorías. Corregí su categoría antes de eliminar la clase.')
    }
    // Mantener los PDF históricos, incluso para cotizaciones viejas sin snapshot.
    const historial = await db.cotizaciones.filter(c => (!c.claseEliminada && claseDe(c) === claseId) || idsTipos.has(c.tipoTrailerId)).toArray()
    for (const cotizacion of historial) {
      const cambios = { claseNombre: cotizacion.claseNombre ?? clase.nombre, claseEliminada: true }
      const tipo = tipos.find(t => t.id === cotizacion.tipoTrailerId)
      if (!cotizacion.snapshot && tipo) {
        const seleccion = normalizarSeleccionadas(cotizacion.variablesSeleccionadas)
        const { valor } = calcularPrecioConGanancia(tipo, variablesDesdeSeleccion(variables, seleccion), 1)
        cambios.snapshot = { tipoTrailerNombre: tipo.nombre, base: valor.base,
          detalle: valor.detalle.map(d => ({ ...d, cantidad: seleccion[d.id] ?? 1 })) }
      }
      await db.cotizaciones.update(cotizacion.id, cambios)
    }
    await db.variables.bulkDelete(variables.filter(v => claseDe(v) === claseId).map(v => v.id))
    await db.categorias.bulkDelete([...idsCategorias])
    await db.tiposTrailer.bulkDelete([...idsTipos])
    await db.clasesProductos.delete(claseId)
    for (const pantalla of ['cotizador', 'comparativa', 'catalogo']) {
      const clave = `claseSeleccionada:${pantalla}`
      const seleccion = await db.config.get(clave)
      if ((seleccion?.valor ?? CLASE_TRAILERS) === claseId) {
        await db.config.put({ clave, valor: CLASE_UNIVERSAL })
      }
    }
    for (const clave of ['borradorCotizador', 'borradorComparativa']) {
      const registro = await db.config.get(clave)
      if (registro && (registro.valor?.claseId ?? CLASE_TRAILERS) === claseId) await db.config.delete(clave)
    }
  })
}
