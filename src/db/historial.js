import Dexie from 'dexie'
import { TABLAS_SYNC, esInterna } from './sincronizacion.js'

/*
 * Historial de cambios con deshacer/rehacer.
 *
 * Cada transacción del usuario que toca el catálogo o las cotizaciones queda como
 * un "paso": en `historial` lo liviano (fecha, descripción, si está deshecho) y en
 * `historialDatos` los registros con su versión de antes y los cambios aplicados.
 * Deshacer reescribe las versiones de antes; rehacer, las de después. Como son
 * escrituras normales, se sellan y viajan por la carpeta compartida como cualquier
 * edición. Lo que llega de otros equipos no se registra (no se deshace acá).
 */

// ponytail: cada paso guarda copias completas (las cotizaciones, con sus imágenes); con
// 100 pasos alcanza y la base no crece de más. Subirlo si piden ir más atrás.
export const MAX_PASOS = 100

// `deshecho` se guarda como 0/1: IndexedDB no indexa booleanos.
const VIGENTE = 0
const DESHECHO = 1

const NOMBRES = {
  clasesProductos: ['clase', 'clases'],
  tiposTrailer: ['tipo de producto', 'tipos de producto'],
  categorias: ['categoría', 'categorías'],
  variables: ['variable', 'variables'],
  cotizaciones: ['cotización', 'cotizaciones']
}
const VERBOS = { crear: 'Agregó', editar: 'Editó', borrar: 'Eliminó' }

// `sinHistorial`: operaciones masivas (importar un backup) que guardarían un paso enorme,
// con todas las imágenes de las cotizaciones.
const noSeRegistra = trans => esInterna(trans) || trans.deshaciendo || trans.sinHistorial

export function registrarHistorial(db) {
  function anotar(trans, entrada) {
    if (!trans.pasoHistorial) {
      const entradas = trans.pasoHistorial = []
      // ponytail: igual que las marcas de borrado, el paso se guarda al confirmar, en otra
      // transacción; si la app se cierra en ese instante, ese cambio no queda en el historial.
      trans.on('complete', () => guardarPaso(db, entradas).catch(err => console.error('Historial:', err)))
    }
    trans.pasoHistorial.push(entrada)
  }
  for (const tabla of TABLAS_SYNC) {
    db.table(tabla).hook('creating', function (_clave, obj, trans) {
      if (noSeRegistra(trans)) return
      const entrada = { tabla, tipo: 'crear' }
      anotar(trans, entrada)
      // Con ++id la clave recién se conoce al insertar.
      this.onsuccess = clave => {
        entrada.clave = clave
        entrada.despues = { ...obj, id: clave }
      }
    })
    db.table(tabla).hook('updating', function (cambios, clave, obj, trans) {
      if (noSeRegistra(trans)) return
      anotar(trans, { tabla, tipo: 'editar', clave, antes: structuredClone(obj), cambios: structuredClone(cambios) })
    })
    db.table(tabla).hook('deleting', function (clave, obj, trans) {
      if (noSeRegistra(trans)) return
      anotar(trans, { tabla, tipo: 'borrar', clave, antes: structuredClone(obj) })
    })
  }
}

async function guardarPaso(db, entradas) {
  await db.transaction('rw', db.historial, db.historialDatos, async () => {
    // Un cambio nuevo descarta lo que se había deshecho (como en cualquier editor).
    await borrarPasos(db, await db.historial.where('deshecho').equals(DESHECHO).primaryKeys())
    const id = await db.historial.add({ fecha: Date.now(), descripcion: describir(entradas), deshecho: VIGENTE })
    await db.historialDatos.add({ id, entradas })
    const sobrantes = await db.historial.count() - MAX_PASOS
    if (sobrantes > 0) await borrarPasos(db, await db.historial.limit(sobrantes).primaryKeys())
  })
}

async function borrarPasos(db, ids) {
  await db.historial.bulkDelete(ids)
  await db.historialDatos.bulkDelete(ids)
}

function nombreDe(entrada) {
  const r = entrada.despues ?? entrada.antes ?? {}
  if (entrada.tabla !== 'cotizaciones') return r.nombre
  const c = r.cliente
  return (typeof c === 'string' ? c : c?.nombreCliente || c?.razonSocial) || 'sin nombre'
}

export function describir(entradas) {
  const [primera] = entradas
  const [singular, plural] = NOMBRES[primera.tabla]
  const mismas = entradas.every(e => e.tabla === primera.tabla && e.tipo === primera.tipo)
  if (mismas && entradas.length > 1) return `${VERBOS[primera.tipo]} ${entradas.length} ${plural}`
  const texto = `${VERBOS[primera.tipo]} ${singular} «${nombreDe(primera)}»`
  return entradas.length > 1 ? `${texto} y ${entradas.length - 1} cambio(s) relacionado(s)` : texto
}

function versionDespues(entrada) {
  if (entrada.tipo !== 'editar') return entrada.despues
  const despues = structuredClone(entrada.antes)
  for (const [ruta, valor] of Object.entries(entrada.cambios)) Dexie.setByKeyPath(despues, ruta, valor)
  return despues
}

// Contenido comparable de un registro: sin la fecha de sincronización y con las claves ordenadas.
const contenido = registro => registro && JSON.stringify(registro, (clave, valor) => {
  if (clave === 'actualizado') return undefined
  return valor && typeof valor === 'object' && !Array.isArray(valor)
    ? Object.fromEntries(Object.entries(valor).sort(([x], [y]) => (x < y ? -1 : 1)))
    : valor
})

/**
 * Deshace o rehace los pasos dados, en orden, en una sola transacción.
 * Un registro que cambió después de ese paso (por ejemplo, desde otra computadora) o que
 * choca con otro dato (mismo nombre) se deja como está, para no pisar nada ni trabar el
 * historial. Devuelve esos registros omitidos para avisarle al usuario.
 */
async function aplicar(db, pasos, deshaciendo) {
  const omitidos = []
  if (!pasos.length) return omitidos
  await db.transaction('rw', [...TABLAS_SYNC, 'historial', 'historialDatos'], async () => {
    Dexie.currentTransaction.deshaciendo = true
    for (const paso of pasos) {
      const { entradas } = await db.historialDatos.get(paso.id)
      for (const e of deshaciendo ? [...entradas].reverse() : entradas) {
        const tabla = db.table(e.tabla)
        const [esperado, version] = deshaciendo ? [versionDespues(e), e.antes] : [e.antes, versionDespues(e)]
        const nombre = `${NOMBRES[e.tabla][0]} «${nombreDe(e)}»`
        if (contenido(await tabla.get(e.clave)) !== contenido(esperado)) {
          omitidos.push(`${nombre} (cambió después)`)
          continue
        }
        try {
          if (version) await tabla.put(version)
          else await tabla.delete(e.clave)
        } catch (err) {
          if (err?.name !== 'ConstraintError') throw err
          omitidos.push(`${nombre} (ya existe otro con ese nombre)`)
        }
      }
      await db.historial.update(paso.id, { deshecho: deshaciendo ? DESHECHO : VIGENTE })
    }
  })
  return omitidos
}

/** Deshace el último paso vigente. Devuelve el paso deshecho (con sus `omitidos`), o null si no había. */
export async function deshacer(db) {
  const paso = await db.historial.where('deshecho').equals(VIGENTE).last()
  return paso ? { ...paso, omitidos: await aplicar(db, [paso], true) } : null
}

/** Rehace el primer paso deshecho. Devuelve el paso rehecho (con sus `omitidos`), o null si no había. */
export async function rehacer(db) {
  const paso = await db.historial.where('deshecho').equals(DESHECHO).first()
  return paso ? { ...paso, omitidos: await aplicar(db, [paso], false) } : null
}

/**
 * Deja los datos como estaban justo después del paso `id` (deshace o rehace lo necesario).
 * Devuelve los registros que no se pudieron llevar a ese punto.
 */
export async function volverA(db, id) {
  const pasos = await db.historial.toArray()
  return [
    ...await aplicar(db, pasos.filter(p => p.deshecho === VIGENTE && p.id > id).reverse(), true),
    ...await aplicar(db, pasos.filter(p => p.deshecho === DESHECHO && p.id <= id), false)
  ]
}
