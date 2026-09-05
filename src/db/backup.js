import { db } from './database.js'
import { CLASE_TRAILERS, CLASES_INICIALES, normalizarNombre, validarClaseCategoria } from '../utils/clasesProductos.js'
import { normalizarSeleccionadas, serializarSeleccionadas } from '../utils/seleccionVariables.js'

export async function exportarBackup() {
  return db.transaction('r', db.tables, async () => ({
    version: 2,
    fechaExportacion: new Date().toISOString(),
    clasesProductos: await db.clasesProductos.toArray(),
    tiposTrailer: await db.tiposTrailer.toArray(),
    categorias: await db.categorias.toArray(),
    variables: await db.variables.toArray(),
    cotizaciones: await db.cotizaciones.toArray(),
    config: await db.config.toArray()
  }))
}

const claveCatalogo = item => JSON.stringify([item.claseId ?? CLASE_TRAILERS, normalizarNombre(item.nombre)])
const nombreCliente = cliente => typeof cliente === 'string'
  ? (cliente === 'Sin nombre' ? '' : cliente) : cliente?.nombreCliente || ''
const claveCotizacion = item => JSON.stringify([item.fecha, item.precioFinal, normalizarNombre(nombreCliente(item.cliente))])

function separar(items, locales, claveFn) {
  const mapa = new Map()
  for (const item of locales) {
    const clave = claveFn(item)
    if (!mapa.has(clave)) mapa.set(clave, [])
    mapa.get(clave).push(item)
  }
  const nuevos = [], duplicados = []
  for (const item of items) {
    const clave = claveFn(item)
    // Versiones anteriores permitían tipos y variables homónimos. Mantener
    // cada registro y su remapeo, incluso en backups de esos catálogos.
    const local = mapa.get(clave)?.shift()
    if (local) duplicados.push({ backup: item, local })
    else nuevos.push(item)
  }
  return { nuevos, duplicados }
}

// Analiza sin modificar la base. Los nombres se comparan dentro de cada clase;
// los identificadores de otra instalación nunca se reutilizan directamente.
export async function analizarBackup(data) {
  if (!data || !Array.isArray(data.tiposTrailer) || !Array.isArray(data.variables)) {
    throw new Error('El archivo no tiene el formato esperado de backup.')
  }
  if (data.version > 2) throw new Error('Este backup requiere una versión más nueva de la aplicación.')
  const local = await exportarBackup()
  const entrantes = data.clasesProductos ?? CLASES_INICIALES
  if (!Array.isArray(entrantes)) throw new Error('Las clases del backup no son válidas.')
  const mapaClases = new Map(), nombres = new Set(), clasesNuevas = []
  for (const clase of entrantes) {
    const nombre = normalizarNombre(clase.nombre)
    if (!nombre || !clase.id || nombres.has(nombre) || mapaClases.has(clase.id)) {
      throw new Error('El backup contiene clases inválidas o repetidas.')
    }
    nombres.add(nombre)
    const reservada = CLASES_INICIALES.find(c => c.id === clase.id)
    if (reservada && normalizarNombre(reservada.nombre) !== nombre) throw new Error('Una clase inicial del backup fue alterada.')
    const existente = local.clasesProductos.find(c => normalizarNombre(c.nombre) === nombre)
    const id = existente?.id ?? reservada?.id ?? crypto.randomUUID()
    mapaClases.set(clase.id, id)
    if (!existente) clasesNuevas.push({ id, nombre: clase.nombre.trim() })
  }
  function prepararClase(item) {
    const claseId = mapaClases.get(item.claseId ?? CLASE_TRAILERS) ?? (item.claseId == null ? CLASE_TRAILERS : undefined)
    if (!claseId) throw new Error('Un registro referencia una clase que no está incluida en el backup.')
    return { ...item, claseId }
  }
  function prepararClaseHistorica(item) {
    if (item.claseEliminada) return { ...item, claseId: null }
    return prepararClase(item)
  }
  const tipos = data.tiposTrailer.map(prepararClase)
  const categorias = (Array.isArray(data.categorias) ? data.categorias : [])
    .map((c, index) => prepararClase({ esDescuento: normalizarNombre(c.nombre).includes('descuento'), ...c,
      id: c.id ?? `legacy-category:${index}` }))
  const variables = data.variables.map(prepararClase)
  for (const variable of variables) {
    let categoria = variable.categoriaId != null
      ? categorias.find(c => c.id === variable.categoriaId)
      : categorias.find(c => c.claseId === variable.claseId && normalizarNombre(c.nombre) === normalizarNombre(variable.categoria))
    if (!categoria && variable.categoriaId != null) throw new Error('Falta una categoría referenciada por una variable en el backup.')
    if (!categoria) {
      categoria = { id: `legacy:${categorias.length}`, nombre: String(variable.categoria || 'Sin categoría').trim(),
        claseId: variable.claseId, esDescuento: normalizarNombre(variable.categoria).includes('descuento') }
      categorias.push(categoria)
    }
    variable.categoriaId = categoria.id
    variable.categoria = categoria.nombre
    const error = validarClaseCategoria(variable, categoria)
    if (error) throw new Error(`Variable «${variable.nombre}» del backup: ${error}`)
  }
  function conClaveVariable(item, cats) {
    const cat = cats.find(c => c.id === item.categoriaId)
    return { ...item, claveImportacion: JSON.stringify([item.claseId ?? CLASE_TRAILERS,
      cat ? claveCatalogo(cat) : claveCatalogo({ nombre: item.categoria }), normalizarNombre(item.nombre)]) }
  }
  return {
    clasesProductos: { nuevos: clasesNuevas, duplicados: [] },
    tiposTrailer: separar(tipos, local.tiposTrailer, claveCatalogo),
    categorias: separar(categorias, local.categorias, claveCatalogo),
    variables: separar(variables.map(v => conClaveVariable(v, categorias)),
      local.variables.map(v => conClaveVariable(v, local.categorias)), v => v.claveImportacion),
    cotizaciones: separar((Array.isArray(data.cotizaciones) ? data.cotizaciones : []).map(prepararClaseHistorica),
      local.cotizaciones, claveCotizacion)
  }
}

export async function combinarBackup(analisis, sobrescribirDuplicados) {
  const resumen = { agregados: 0, sobrescritos: 0, mantenidos: 0 }
  const mapaTipos = new Map(), mapaCategorias = new Map(), mapaVariables = new Map()
  function sinId(item) {
    const { id, claveImportacion, ...resto } = item
    return resto
  }
  async function combinar(tabla, grupo, mapa, preparar = sinId) {
    for (const item of grupo.nuevos) {
      const nuevoId = await tabla.add(await preparar(item))
      if (mapa && item.id != null) mapa.set(item.id, nuevoId)
      resumen.agregados++
    }
    for (const { backup, local } of grupo.duplicados) {
      if (sobrescribirDuplicados) {
        await tabla.update(local.id, await preparar(backup))
        resumen.sobrescritos++
      } else resumen.mantenidos++
      if (mapa && backup.id != null) mapa.set(backup.id, local.id)
    }
  }
  await db.transaction('rw', db.clasesProductos, db.tiposTrailer, db.categorias, db.variables, db.cotizaciones, async () => {
    for (const clase of analisis.clasesProductos.nuevos) {
      await db.clasesProductos.add(clase)
      resumen.agregados++
    }
    await combinar(db.tiposTrailer, analisis.tiposTrailer, mapaTipos)
    await combinar(db.categorias, analisis.categorias, mapaCategorias)
    await combinar(db.variables, analisis.variables, mapaVariables, async item => {
      const categoriaId = mapaCategorias.get(item.categoriaId)
      const categoria = categoriaId == null ? null : await db.categorias.get(categoriaId)
      if (!categoria) throw new Error('No se pudo vincular la categoría de una variable.')
      const error = validarClaseCategoria(item, categoria)
      if (error) throw new Error(error)
      return { ...sinId(item), categoriaId, categoria: categoria.nombre }
    })
    await combinar(db.cotizaciones, analisis.cotizaciones, null, item => {
      const resto = sinId(item)
      // Si un producto ya no existe en el origen, no asociar por accidente el
      // id viejo con otro producto local. El snapshot histórico se conserva.
      resto.tipoTrailerId = mapaTipos.get(item.tipoTrailerId) ?? null
      resto.variablesSeleccionadas = serializarSeleccionadas(Object.fromEntries(
        Object.entries(normalizarSeleccionadas(item.variablesSeleccionadas))
          .filter(([id]) => mapaVariables.has(Number(id)))
          .map(([id, cantidad]) => [mapaVariables.get(Number(id)), cantidad])
      ))
      if (typeof resto.cliente === 'string' || !resto.cliente) {
        resto.cliente = { nombreCliente: nombreCliente(resto.cliente), razonSocial: '', cuit: '' }
      }
      return resto
    })
  })
  return resumen
}
