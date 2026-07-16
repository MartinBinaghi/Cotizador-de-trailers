import Dexie from 'dexie'
import { normalizarSeleccionadas, serializarSeleccionadas } from '../utils/seleccionVariables'

// Toda la data vive en el navegador (IndexedDB). No hay backend ni nube.
export const db = new Dexie('CotizadorTrailersDB')

db.version(2).stores({
  // Catálogo de tipos de trailer, con su precio base
  tiposTrailer: '++id, nombre, precioBase',

  // Catálogo de variables configurables, agrupadas por categoría
  // tipoModificador: 'fijo' (+$) o 'porcentual' (+%)
  // aplicaSobre: 'base' o 'subtotal' (para porcentuales: sobre qué se calcula el %)
  // permiteCantidad: bool, si se puede cargar una cantidad > 1 al seleccionarla
  // esOpcional: bool, si es un adicional opcional (se cotiza aparte) o viene
  //   incluida de forma estándar en el trailer. No indexado, igual que permiteCantidad.
  variables: '++id, categoria, nombre, tipoModificador, valor, aplicaSobre',

  // Historial de cotizaciones generadas
  cotizaciones:
    '++id, tipoTrailerId, fecha, precioFinal, cliente',

  // Configuración general de la app (clave-valor), ej: redondeo
  config: 'clave'
})

db.version(3).stores({
  tiposTrailer: '++id, nombre, precioBase',
  categorias: '++id, &nombre',
  variables: '++id, categoria, nombre, tipoModificador, valor, aplicaSobre',
  cotizaciones: '++id, tipoTrailerId, fecha, precioFinal, cliente',
  config: 'clave'
}).upgrade(async tx => {
  const categoriasTable = tx.table('categorias')
  const cantidadCategorias = await categoriasTable.count()
  if (cantidadCategorias > 0) return

  const variables = await tx.table('variables').toArray()
  const nombresCategorias = [...new Set(
    variables
      .map(variable => variable.categoria)
      .filter(Boolean)
      .map(nombre => String(nombre).trim())
      .filter(Boolean)
  )]

  if (nombresCategorias.length > 0) {
    await categoriasTable.bulkAdd(nombresCategorias.map(nombre => ({ nombre })))
  }
})

// v4: "cliente" pasa de string simple a objeto {nombreCliente, razonSocial, cuit}
// (los 3 campos son opcionales). Se deja de indexar por 'cliente' porque nunca
// se hizo una query Dexie por ese campo (la búsqueda en Historial es en JS).
db.version(4).stores({
  tiposTrailer: '++id, nombre, precioBase',
  categorias: '++id, &nombre',
  variables: '++id, categoria, nombre, tipoModificador, valor, aplicaSobre',
  cotizaciones: '++id, tipoTrailerId, fecha, precioFinal',
  config: 'clave'
}).upgrade(async tx => {
  await tx.table('cotizaciones').toCollection().modify(cotizacion => {
    if (typeof cotizacion.cliente === 'string') {
      const nombreCliente = cotizacion.cliente === 'Sin nombre' ? '' : cotizacion.cliente
      cotizacion.cliente = { nombreCliente, razonSocial: '', cuit: '' }
    } else if (!cotizacion.cliente || typeof cotizacion.cliente !== 'object') {
      cotizacion.cliente = { nombreCliente: '', razonSocial: '', cuit: '' }
    }
  })
})

// --- Backup / restore ---

/** Exporta toda la base a un objeto plano, listo para JSON.stringify */
export async function exportarBackup() {
  const [tiposTrailer, categorias, variables, cotizaciones, config] = await Promise.all([
    db.tiposTrailer.toArray(),
    db.categorias.toArray(),
    db.variables.toArray(),
    db.cotizaciones.toArray(),
    db.config.toArray()
  ])
  return {
    version: 1,
    fechaExportacion: new Date().toISOString(),
    tiposTrailer,
    categorias,
    variables,
    cotizaciones,
    config
  }
}

function normalizarTexto(s) {
  return String(s ?? '').trim().toLowerCase()
}

function nombreClienteDe(cliente) {
  if (!cliente) return ''
  if (typeof cliente === 'string') return cliente === 'Sin nombre' ? '' : cliente
  return cliente.nombreCliente || ''
}

const claveTipoTrailer = item => normalizarTexto(item.nombre)
const claveCategoria = item => normalizarTexto(item.nombre)
const claveVariable = item => `${normalizarTexto(item.categoria)}|${normalizarTexto(item.nombre)}`
const claveCotizacion = item =>
  `${item.fecha}|${item.precioFinal}|${normalizarTexto(nombreClienteDe(item.cliente))}`

function separarNuevosYDuplicados(itemsBackup, itemsLocal, claveFn) {
  const mapaLocal = new Map(itemsLocal.map(item => [claveFn(item), item]))
  const nuevos = []
  const duplicados = []
  for (const item of itemsBackup) {
    const local = mapaLocal.get(claveFn(item))
    if (local) duplicados.push({ backup: item, local })
    else nuevos.push(item)
  }
  return { nuevos, duplicados }
}

/**
 * Compara un backup contra los datos locales SIN modificar la base.
 * Para cada tabla separa los registros del backup en "nuevos" (no existen
 * localmente) y "duplicados" (ya hay un registro local equivalente, según
 * nombre normalizado — o categoría+nombre para variables, o
 * cliente+fecha+total para cotizaciones). La tabla 'config' no se analiza:
 * nunca se combina, se mantiene siempre la local.
 */
export async function analizarBackup(data) {
  if (!data || !Array.isArray(data.tiposTrailer) || !Array.isArray(data.variables)) {
    throw new Error('El archivo no tiene el formato esperado de backup.')
  }

  const [tiposTrailerLocal, categoriasLocal, variablesLocal, cotizacionesLocal] = await Promise.all([
    db.tiposTrailer.toArray(),
    db.categorias.toArray(),
    db.variables.toArray(),
    db.cotizaciones.toArray()
  ])

  const categoriasBackup = Array.isArray(data.categorias) && data.categorias.length > 0
    ? data.categorias
    : [...new Set(data.variables.map(v => v.categoria).filter(Boolean))].map(nombre => ({ nombre }))

  return {
    tiposTrailer: separarNuevosYDuplicados(data.tiposTrailer, tiposTrailerLocal, claveTipoTrailer),
    categorias: separarNuevosYDuplicados(categoriasBackup, categoriasLocal, claveCategoria),
    variables: separarNuevosYDuplicados(data.variables, variablesLocal, claveVariable),
    cotizaciones: separarNuevosYDuplicados(
      Array.isArray(data.cotizaciones) ? data.cotizaciones : [],
      cotizacionesLocal,
      claveCotizacion
    )
  }
}

/**
 * Aplica el resultado de analizarBackup(): agrega todos los registros
 * "nuevos" (nunca se pierden datos locales) y, para los "duplicados",
 * sobrescribe con los datos del backup o los deja como están según
 * `sobrescribirDuplicados`. Los ids que trae el backup son locales de OTRA
 * instalación y no se reutilizan: se remapean tipoTrailerId y los ids de
 * variables dentro de variablesSeleccionadas de cada cotización, para que
 * sigan apuntando al registro correcto ya combinado.
 * @returns {Promise<{agregados: number, sobrescritos: number, mantenidos: number}>}
 */
export async function combinarBackup(analisis, sobrescribirDuplicados) {
  let agregados = 0
  let sobrescritos = 0
  let mantenidos = 0
  const mapaTipoTrailerId = new Map()
  const mapaVariableId = new Map()

  function remapVariablesSeleccionadas(variablesSeleccionadas) {
    const mapa = normalizarSeleccionadas(variablesSeleccionadas)
    const remapeado = {}
    for (const [idStr, cantidad] of Object.entries(mapa)) {
      const idOriginal = Number(idStr)
      const idFinal = mapaVariableId.get(idOriginal) ?? idOriginal
      remapeado[idFinal] = cantidad
    }
    return serializarSeleccionadas(remapeado)
  }

  function prepararCotizacion(item) {
    const { id: _idBackup, ...resto } = item
    if (resto.tipoTrailerId != null && mapaTipoTrailerId.has(resto.tipoTrailerId)) {
      resto.tipoTrailerId = mapaTipoTrailerId.get(resto.tipoTrailerId)
    }
    resto.variablesSeleccionadas = remapVariablesSeleccionadas(resto.variablesSeleccionadas)
    if (typeof resto.cliente === 'string') {
      resto.cliente = { nombreCliente: nombreClienteDe(resto.cliente), razonSocial: '', cuit: '' }
    } else if (!resto.cliente || typeof resto.cliente !== 'object') {
      resto.cliente = { nombreCliente: '', razonSocial: '', cuit: '' }
    }
    return resto
  }

  await db.transaction('rw', db.tiposTrailer, db.categorias, db.variables, db.cotizaciones, async () => {
    for (const item of analisis.tiposTrailer.nuevos) {
      const { id: idBackup, ...resto } = item
      const nuevoId = await db.tiposTrailer.add(resto)
      if (idBackup != null) mapaTipoTrailerId.set(idBackup, nuevoId)
      agregados++
    }
    for (const { backup, local } of analisis.tiposTrailer.duplicados) {
      if (sobrescribirDuplicados) {
        const { id: _idBackup, ...resto } = backup
        await db.tiposTrailer.update(local.id, resto)
        sobrescritos++
      } else {
        mantenidos++
      }
      if (backup.id != null) mapaTipoTrailerId.set(backup.id, local.id)
    }

    for (const item of analisis.categorias.nuevos) {
      const { id: _idBackup, ...resto } = item
      await db.categorias.add(resto)
      agregados++
    }
    for (const { backup, local } of analisis.categorias.duplicados) {
      if (sobrescribirDuplicados) {
        const { id: _idBackup, ...resto } = backup
        await db.categorias.update(local.id, resto)
        sobrescritos++
      } else {
        mantenidos++
      }
    }

    for (const item of analisis.variables.nuevos) {
      const { id: idBackup, ...resto } = item
      const nuevoId = await db.variables.add(resto)
      if (idBackup != null) mapaVariableId.set(idBackup, nuevoId)
      agregados++
    }
    for (const { backup, local } of analisis.variables.duplicados) {
      if (sobrescribirDuplicados) {
        const { id: _idBackup, ...resto } = backup
        await db.variables.update(local.id, resto)
        sobrescritos++
      } else {
        mantenidos++
      }
      if (backup.id != null) mapaVariableId.set(backup.id, local.id)
    }

    for (const item of analisis.cotizaciones.nuevos) {
      await db.cotizaciones.add(prepararCotizacion(item))
      agregados++
    }
    for (const { backup, local } of analisis.cotizaciones.duplicados) {
      if (sobrescribirDuplicados) {
        await db.cotizaciones.update(local.id, prepararCotizacion(backup))
        sobrescritos++
      } else {
        mantenidos++
      }
    }
  })

  return { agregados, sobrescritos, mantenidos }
}

// --- Configuración: redondeo del precio final ---
// Valores posibles: 1 (sin redondeo), 100, 1000, 10000
export async function getRedondeo() {
  const c = await db.config.get('redondeo')
  return c ? c.valor : 1
}

export async function setRedondeo(valor) {
  await db.config.put({ clave: 'redondeo', valor: Number(valor) })
}

// --- Ajuste masivo de precios ---

/**
 * Aumenta (o disminuye, si porcentaje es negativo) los precios en pesos de
 * los ítems seleccionados del catálogo: el precioBase de los tipos de
 * trailer cuyo id esté en idsTipos, y el valor de las variables cuyo id
 * esté en idsVariables y cuyo tipoModificador sea 'fijo'. Las variables
 * 'porcentual' NUNCA se tocan (aumentar un 10% un "+15%" no tiene sentido).
 *
 * @param {number} porcentaje ej: 10 para +10%, -5 para -5%
 * @param {number[]} idsTipos ids de tiposTrailer a actualizar
 * @param {number[]} idsVariables ids de variables (fijo) a actualizar
 * @returns {Promise<{tiposActualizados: number, variablesActualizadas: number}>}
 */
export async function actualizarPreciosPorcentaje(porcentaje, idsTipos = [], idsVariables = []) {
  const pct = Number(porcentaje)
  if (Number.isNaN(pct)) {
    throw new Error('El porcentaje debe ser un número.')
  }
  if (pct <= -100) {
    throw new Error('El porcentaje no puede ser -100% o menor (dejaría precios en cero o negativos).')
  }
  if (idsTipos.length === 0 && idsVariables.length === 0) {
    throw new Error('Seleccioná al menos un tipo de trailer o variable.')
  }

  const factor = 1 + pct / 100
  let tiposActualizados = 0
  let variablesActualizadas = 0

  await db.transaction('rw', db.tiposTrailer, db.variables, async () => {
    if (idsTipos.length > 0) {
      await db.tiposTrailer.where('id').anyOf(idsTipos).modify(tipo => {
        tipo.precioBase = Math.round(tipo.precioBase * factor)
        tiposActualizados++
      })
    }

    if (idsVariables.length > 0) {
      await db.variables
        .where('id')
        .anyOf(idsVariables)
        .and(variable => variable.tipoModificador === 'fijo')
        .modify(variable => {
          variable.valor = Math.round(variable.valor * factor)
          variablesActualizadas++
        })
    }
  })

  return { tiposActualizados, variablesActualizadas }
}

async function ensureCategoriasSeeded() {
  const count = await db.categorias.count()
  if (count > 0) return

  const variables = await db.variables.toArray()

  const nombres = [...new Set(
    variables
      .map(variable => variable.categoria)
      .filter(Boolean)
      .map(nombre => String(nombre).trim())
      .filter(Boolean)
  )]

  const categoriasFinales = nombres.length > 0
    ? nombres
    : ['Frenos', 'Homologación', 'Ejes', 'Descuentos']

  await db.categorias.bulkAdd(categoriasFinales.map(nombre => ({ nombre })))
}


// --- Datos de ejemplo (seed) para arrancar a probar la app ---
// Todo el chequeo + inserción va en una única transacción: si seedIfEmpty()
// se llama dos veces casi al mismo tiempo (ej. React.StrictMode monta los
// efectos dos veces en desarrollo), la segunda transacción queda en cola
// hasta que la primera termine, y al ejecutar ya ve el catálogo poblado
// en vez de volver a insertarlo (lo que antes duplicaba los tipos de trailer).
export async function seedIfEmpty() {
  await db.transaction('rw', db.tiposTrailer, db.categorias, db.variables, async () => {
    const count = await db.tiposTrailer.count()
    if (count > 0) {
      await ensureCategoriasSeeded()
      return
    }

    await db.tiposTrailer.bulkAdd([
      { nombre: 'Semirremolque', precioBase: 8000000 },
      { nombre: 'Batea', precioBase: 6500000 },
      { nombre: 'Tanque', precioBase: 9500000 }
    ])

    await db.categorias.bulkAdd([
      { nombre: 'Frenos' },
      { nombre: 'Homologación' },
      { nombre: 'Ejes' },
      { nombre: 'Descuentos' }
    ])

    await db.variables.bulkAdd([
      { categoria: 'Frenos', nombre: '2 frenos', tipoModificador: 'fijo', valor: 150000, aplicaSobre: 'base' },
      { categoria: 'Frenos', nombre: '4 frenos', tipoModificador: 'fijo', valor: 300000, aplicaSobre: 'base' },
      { categoria: 'Homologación', nombre: 'Homologado', tipoModificador: 'porcentual', valor: 15, aplicaSobre: 'subtotal' },
      { categoria: 'Ejes', nombre: 'Eje reforzado', tipoModificador: 'fijo', valor: 400000, aplicaSobre: 'base' },
      { categoria: 'Descuentos', nombre: 'Descuento por pago de contado', tipoModificador: 'porcentual', valor: -5, aplicaSobre: 'subtotal' }
    ])
  })
}
