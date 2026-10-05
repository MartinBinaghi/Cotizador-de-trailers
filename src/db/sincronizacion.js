import Dexie from 'dexie'
import { normalizarNombre } from '../utils/clasesProductos.js'
import { normalizarSeleccionadas, serializarSeleccionadas } from '../utils/seleccionVariables.js'

/*
 * Sincronización entre equipos mediante una carpeta compartida (ej: un Drive
 * que se ve como carpeta en Windows).
 *
 * - Cada equipo escribe SOLO su archivo (cotizador-sync-<equipo>.json) con su
 *   estado completo; así el Drive nunca tiene dos escritores sobre un archivo.
 * - Cada equipo lee los archivos de los demás y los combina con su base:
 *   por registro gana el cambio más reciente (`actualizado`), y los borrados
 *   viajan como "eliminados" con su fecha.
 * - Los registros se identifican entre equipos por `uid` (los `id` numéricos
 *   son locales de cada base). Los datos que dos equipos cargaron por separado
 *   (mismo nombre en la misma clase) se unifican adoptando el uid menor.
 */

export const TABLAS_SYNC = ['clasesProductos', 'tiposTrailer', 'categorias', 'variables', 'cotizaciones']
export const PREFIJO_ARCHIVO = 'cotizador-sync-'
export const FORMATO_SYNC = 1

/** Avisa los cambios locales (no los que trae la sincronización) para programar una escritura. */
export const cambiosLocales = new EventTarget()

const uidDe = (tabla, registro) => (tabla === 'clasesProductos' ? registro.id : registro.uid)
const esInterna = trans => trans.mode === 'versionchange' || trans.sincronizando

/** Sella uid/fecha en cada alta o edición y registra cada borrado, venga de la pantalla que venga. */
export function registrarHooks(db) {
  const avisar = () => cambiosLocales.dispatchEvent(new Event('cambio'))
  for (const nombre of TABLAS_SYNC) {
    const tabla = db.table(nombre)
    tabla.hook('creating', function (_clave, obj, trans) {
      if (esInterna(trans)) return
      if (nombre !== 'clasesProductos') obj.uid ??= crypto.randomUUID()
      obj.actualizado = Date.now()
      avisar()
    })
    tabla.hook('updating', function (_cambios, _clave, _obj, trans) {
      if (esInterna(trans)) return
      avisar()
      return { actualizado: Date.now() }
    })
    tabla.hook('deleting', function (_clave, obj, trans) {
      if (esInterna(trans)) return
      const uid = uidDe(nombre, obj)
      const fecha = Date.now()
      // ponytail: la marca de borrado se escribe al confirmar la transacción, en
      // otra transacción; si la app se cierra justo en ese instante, el registro
      // puede reaparecer desde otro equipo (no se pierde nada, se puede volver a borrar).
      if (uid) trans.on('complete', () => db.eliminados.put({ clave: `${nombre}:${uid}`, tabla: nombre, uid, fecha }))
      avisar()
    })
  }
}

/** Estado de este equipo listo para escribir en la carpeta: referencias por uid, sin ids locales. */
export async function exportarEstado(db) {
  return db.transaction('r', [...TABLAS_SYNC, 'eliminados'], async () => {
    const [clases, tipos, categorias, variables, cotizaciones, eliminados] = await Promise.all(
      [...TABLAS_SYNC, 'eliminados'].map(t => db.table(t).toArray())
    )
    const uidPorId = lista => new Map(lista.map(r => [r.id, r.uid]))
    const uidCategoria = uidPorId(categorias), uidTipo = uidPorId(tipos), uidVariable = uidPorId(variables)
    const sinId = ({ id, ...resto }) => resto
    return {
      clasesProductos: clases.map(c => ({ ...c, actualizado: c.actualizado ?? 0 })),
      tiposTrailer: tipos.map(sinId),
      categorias: categorias.map(sinId),
      variables: variables.map(({ id, categoriaId, ...resto }) => ({ ...resto, categoriaUid: uidCategoria.get(categoriaId) ?? null })),
      cotizaciones: cotizaciones.map(({ id, tipoTrailerId, variablesSeleccionadas, ...resto }) => ({
        ...resto,
        tipoUid: uidTipo.get(tipoTrailerId) ?? null,
        variablesSeleccionadas: Object.entries(normalizarSeleccionadas(variablesSeleccionadas))
          .map(([idVariable, cantidad]) => ({ uid: uidVariable.get(Number(idVariable)), cantidad }))
          .filter(s => s.uid)
      })),
      eliminados
    }
  })
}

const nombreCliente = c => (typeof c === 'string' ? c : c?.nombreCliente ?? '')
const CLAVES_NATURALES = {
  tiposTrailer: r => JSON.stringify([r.claseId, normalizarNombre(r.nombre)]),
  categorias: r => JSON.stringify([r.claseId, normalizarNombre(r.nombre)]),
  variables: r => JSON.stringify([r.claseId, r.categoriaId, normalizarNombre(r.nombre)]),
  cotizaciones: r => JSON.stringify([r.fecha, r.precioFinal, normalizarNombre(nombreCliente(r.cliente))])
}

/**
 * Combina en la base local el estado exportado por otro equipo.
 * No sella fechas ni genera marcas de borrado nuevas: aplicar dos veces lo
 * mismo no cambia nada (así dos equipos no se rebotan cambios entre sí).
 * @returns {Promise<number>} cantidad de registros agregados, modificados o borrados
 */
export async function aplicarEstado(db, estado) {
  let cambios = 0
  await db.transaction('rw', [...TABLAS_SYNC, 'eliminados'], async () => {
    Dexie.currentTransaction.sincronizando = true

    const tumbas = new Map((await db.eliminados.toArray()).map(t => [t.clave, t]))
    for (const tumba of estado.eliminados ?? []) {
      const local = tumbas.get(tumba.clave)
      if (!local || tumba.fecha > local.fecha) {
        await db.eliminados.put(tumba)
        tumbas.set(tumba.clave, tumba)
      }
    }
    const borradoDespues = (tabla, registro) =>
      (tumbas.get(`${tabla}:${registro.uid}`)?.fecha ?? -1) >= (registro.actualizado ?? 0)

    // Clases: el id es global (las iniciales son fijas, las nuevas son UUID). Una
    // clase creada con el mismo nombre en dos equipos se toma como la misma.
    const alias = new Map()
    const clasesLocales = await db.clasesProductos.toArray()
    for (const clase of estado.clasesProductos ?? []) {
      if (borradoDespues('clasesProductos', { uid: clase.id, actualizado: clase.actualizado })) continue
      const mismaId = clasesLocales.find(c => c.id === clase.id)
      const mismoNombre = clasesLocales.find(c => normalizarNombre(c.nombre) === normalizarNombre(clase.nombre))
      if (!mismaId && mismoNombre) { alias.set(clase.id, mismoNombre.id); continue }
      try {
        if (!mismaId) {
          await db.clasesProductos.add(clase)
          clasesLocales.push(clase)
          cambios++
        } else if ((clase.actualizado ?? 0) > (mismaId.actualizado ?? 0)) {
          await db.clasesProductos.put(clase)
          cambios++
        }
      } catch (err) {
        if (err?.name !== 'ConstraintError') throw err
      }
    }
    const idsClases = new Set(clasesLocales.map(c => c.id))
    const claseLocal = claseId => {
      if (claseId == null) return null
      const id = alias.get(claseId) ?? claseId
      return idsClases.has(id) ? id : undefined
    }

    async function aplicarTabla(nombre, entrantes = [], traducir) {
      const tabla = db.table(nombre)
      const locales = await tabla.toArray()
      const porUid = new Map(locales.map(r => [r.uid, r]))
      const claveNatural = CLAVES_NATURALES[nombre]
      const porClave = new Map(locales.map(r => [claveNatural(r), r]))
      for (const remoto of entrantes) {
        if (!remoto.uid || borradoDespues(nombre, remoto)) continue
        const datos = await traducir(remoto)
        if (!datos) continue // referencia todavía no disponible: se reintenta en la próxima pasada
        let local = porUid.get(remoto.uid) ?? porClave.get(claveNatural(datos))
        try {
          if (local && local.uid !== remoto.uid && remoto.uid < local.uid) {
            await tabla.update(local.id, { uid: remoto.uid })
            porUid.delete(local.uid)
            local = { ...local, uid: remoto.uid }
            porUid.set(local.uid, local)
          }
          if (!local) {
            const id = await tabla.add(datos)
            const nuevo = { ...datos, id }
            porUid.set(nuevo.uid, nuevo)
            porClave.set(claveNatural(nuevo), nuevo)
            cambios++
          } else if ((remoto.actualizado ?? 0) > (local.actualizado ?? 0)) {
            const actualizado = { ...datos, id: local.id, uid: local.uid }
            await tabla.put(actualizado)
            porUid.set(local.uid, actualizado)
            cambios++
          }
        } catch (err) {
          // Choque con un dato local distinto (ej: dos categorías renombradas igual).
          // Se deja el dato local y se sigue con el resto.
          if (err?.name !== 'ConstraintError') throw err
        }
      }
    }

    const quitar = (obj, ...campos) => {
      const copia = { ...obj }
      for (const campo of campos) delete copia[campo]
      return copia
    }
    const conClase = r => {
      const claseId = claseLocal(r.claseId)
      return claseId === undefined ? null : { ...r, claseId }
    }

    await aplicarTabla('tiposTrailer', estado.tiposTrailer, conClase)
    await aplicarTabla('categorias', estado.categorias, conClase)
    const categoriaPorUid = new Map((await db.categorias.toArray()).map(c => [c.uid, c]))
    await aplicarTabla('variables', estado.variables, r => {
      const categoria = categoriaPorUid.get(r.categoriaUid)
      const conClaseLocal = conClase(r)
      if (!categoria || !conClaseLocal) return null
      return { ...quitar(conClaseLocal, 'categoriaUid'), categoriaId: categoria.id, categoria: categoria.nombre }
    })
    const tipoPorUid = new Map((await db.tiposTrailer.toArray()).map(t => [t.uid, t.id]))
    const variablePorUid = new Map((await db.variables.toArray()).map(v => [v.uid, v.id]))
    await aplicarTabla('cotizaciones', estado.cotizaciones, r => {
      const claseId = r.claseId == null ? null : claseLocal(r.claseId)
      if (claseId === undefined) return null
      const seleccion = {}
      for (const { uid, cantidad } of r.variablesSeleccionadas ?? []) {
        if (variablePorUid.has(uid)) seleccion[variablePorUid.get(uid)] = cantidad
      }
      return {
        ...quitar(r, 'tipoUid'), claseId,
        // El snapshot conserva el PDF aunque el producto no exista en este equipo.
        tipoTrailerId: tipoPorUid.get(r.tipoUid) ?? null,
        variablesSeleccionadas: serializarSeleccionadas(seleccion)
      }
    })

    // Borrados: de los que dependen hacia los que son referenciados.
    for (const nombre of [...TABLAS_SYNC].reverse()) {
      const tabla = db.table(nombre)
      for (const registro of await tabla.toArray()) {
        const uid = uidDe(nombre, registro)
        if (borradoDespues(nombre, { uid, actualizado: registro.actualizado })) {
          await tabla.delete(registro.id)
          cambios++
        }
      }
    }
  })
  return cambios
}

/** Pasa todos los registros a "recién modificados": al combinar, esta versión gana a la de la carpeta. */
export async function priorizarDatosLocales(db) {
  const ahora = Date.now()
  await db.transaction('rw', TABLAS_SYNC, async () => {
    Dexie.currentTransaction.sincronizando = true
    for (const nombre of TABLAS_SYNC) await db.table(nombre).toCollection().modify({ actualizado: ahora })
  })
}

const archivoPropio = equipo => `${PREFIJO_ARCHIVO}${equipo}.json`

/**
 * Una pasada completa contra la carpeta. `io` abstrae el sistema de archivos:
 * listar() -> [{ nombre, modificado }], leer(nombre) -> texto, escribir(nombre, texto).
 * `leidos` (Map nombre -> modificado) evita volver a leer archivos que no cambiaron.
 * @returns {Promise<{ cambios: number, equipos: Array<{ nombre: string, modificado: number, propio: boolean }> }>}
 */
export async function sincronizarCarpeta(db, io, { equipo, escribir, leidos = new Map() }) {
  const propio = archivoPropio(equipo)
  const archivos = (await io.listar()).filter(a => a.nombre.startsWith(PREFIJO_ARCHIVO) && a.nombre.endsWith('.json'))
  let cambios = 0
  for (const archivo of archivos) {
    if (archivo.nombre === propio || leidos.get(archivo.nombre) === archivo.modificado) continue
    const estado = JSON.parse(await io.leer(archivo.nombre))
    if (estado.formato > FORMATO_SYNC) {
      throw new Error('Otro equipo usa una versión más nueva del cotizador. Actualizá esta computadora para sincronizar.')
    }
    cambios += await aplicarEstado(db, estado)
    leidos.set(archivo.nombre, archivo.modificado)
  }
  const tieneArchivo = archivos.some(a => a.nombre === propio)
  if (escribir || !tieneArchivo) {
    const estado = await exportarEstado(db)
    await io.escribir(propio, JSON.stringify({ formato: FORMATO_SYNC, equipo, exportado: Date.now(), ...estado }))
  }
  return {
    cambios,
    equipos: archivos.map(a => ({ nombre: a.nombre, modificado: a.modificado, propio: a.nombre === propio }))
  }
}
