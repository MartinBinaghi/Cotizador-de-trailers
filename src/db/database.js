import Dexie from 'dexie'
import { CLASE_TRAILERS, CLASES_INICIALES, normalizarNombre } from '../utils/clasesProductos.js'

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

// v5: las categorías ganan el flag booleano `esDescuento` (no indexado), que
// reemplaza a la heurística de "el nombre contiene 'descuento'". Las
// existentes se migran una única vez con esa misma heurística.
db.version(5).stores({
  tiposTrailer: '++id, nombre, precioBase',
  categorias: '++id, &nombre',
  variables: '++id, categoria, nombre, tipoModificador, valor, aplicaSobre',
  cotizaciones: '++id, tipoTrailerId, fecha, precioFinal',
  config: 'clave'
}).upgrade(async tx => {
  await tx.table('categorias').toCollection().modify(cat => {
    if (cat.esDescuento === undefined) {
      cat.esDescuento = esNombreDescuento(cat.nombre)
    }
  })
})

// v6 conserva los ids históricos y vincula las variables por id de categoría.
// El nombre deja de ser único globalmente: cada clase tiene su propio catálogo.
db.version(6).stores({
  clasesProductos: 'id, &nombre',
  tiposTrailer: '++id, nombre, precioBase, claseId',
  categorias: '++id, nombre, claseId, &[claseId+nombre]',
  variables: '++id, categoria, categoriaId, nombre, tipoModificador, valor, aplicaSobre, claseId',
  cotizaciones: '++id, tipoTrailerId, fecha, precioFinal',
  config: 'clave'
}).upgrade(async tx => {
  await tx.table('clasesProductos').bulkAdd(CLASES_INICIALES)
  await tx.table('tiposTrailer').toCollection().modify({ claseId: CLASE_TRAILERS })
  await tx.table('categorias').toCollection().modify({ claseId: CLASE_TRAILERS })
  const categorias = await tx.table('categorias').toArray()
  const porNombre = new Map(categorias.map(c => [normalizarNombre(c.nombre), c]))
  const variables = await tx.table('variables').toArray()
  for (const variable of variables) {
    let categoria = porNombre.get(normalizarNombre(variable.categoria))
    if (!categoria) {
      categoria = { nombre: String(variable.categoria || 'Sin categoría').trim(), claseId: CLASE_TRAILERS,
        esDescuento: esNombreDescuento(variable.categoria) }
      categoria.id = await tx.table('categorias').add(categoria)
      porNombre.set(normalizarNombre(variable.categoria), categoria)
    }
    await tx.table('variables').update(variable.id, {
      claseId: CLASE_TRAILERS, categoriaId: categoria.id, categoria: categoria.nombre
    })
  }
  await tx.table('cotizaciones').toCollection().modify({ claseId: CLASE_TRAILERS })
})

db.on('populate', tx => tx.table('clasesProductos').bulkAdd(CLASES_INICIALES))

/** Heurística usada SOLO para migrar/importar datos que no traen el flag esDescuento. */
function esNombreDescuento(nombre) {
  return String(nombre ?? '').toLowerCase().includes('descuento')
}

export { exportarBackup, analizarBackup, combinarBackup } from './backup.js'

export async function guardarBorrador(pantalla, clave, claseId, valor) {
  await db.transaction('rw', db.config, db.clasesProductos, async () => {
    if (!await db.clasesProductos.get(claseId)) return
    const seleccion = await db.config.get(`claseSeleccionada:${pantalla}`)
    // Una lectura de imagen o un efecto del formulario anterior puede terminar
    // después del cambio de clase; nunca debe revivir el borrador descartado.
    if ((seleccion?.valor ?? CLASE_TRAILERS) !== claseId) return
    await db.config.put({ clave, valor: { ...valor, claseId } })
  })
}

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

  await db.categorias.bulkAdd(
    categoriasFinales.map(nombre => ({ nombre, claseId: CLASE_TRAILERS, esDescuento: esNombreDescuento(nombre) }))
  )
}


// --- Datos de ejemplo (seed) para arrancar a probar la app ---
// Todo el chequeo + inserción va en una única transacción: si seedIfEmpty()
// se llama dos veces casi al mismo tiempo (ej. React.StrictMode monta los
// efectos dos veces en desarrollo), la segunda transacción queda en cola
// hasta que la primera termine, y al ejecutar ya ve el catálogo poblado
// en vez de volver a insertarlo (lo que antes duplicaba los tipos de trailer).
export async function seedIfEmpty() {
  await db.transaction('rw', db.tiposTrailer, db.categorias, db.variables, db.clasesProductos, async () => {
    // Si el usuario eliminó Trailers, el seed de desarrollo no debe revivir sus datos.
    if (!await db.clasesProductos.get(CLASE_TRAILERS)) return
    const count = await db.tiposTrailer.count()
    if (count > 0) {
      await ensureCategoriasSeeded()
      return
    }

    await db.tiposTrailer.bulkAdd([
      { nombre: 'Semirremolque', precioBase: 8000000 },
      { nombre: 'Batea', precioBase: 6500000 },
      { nombre: 'Tanque', precioBase: 9500000 }
    ].map(item => ({ ...item, claseId: CLASE_TRAILERS })))

    await db.categorias.bulkAdd([
      { nombre: 'Frenos', esDescuento: false },
      { nombre: 'Homologación', esDescuento: false },
      { nombre: 'Ejes', esDescuento: false },
      { nombre: 'Descuentos', esDescuento: true }
    ].map(item => ({ ...item, claseId: CLASE_TRAILERS })))

    await db.variables.bulkAdd([
      { categoria: 'Frenos', nombre: '2 frenos', tipoModificador: 'fijo', valor: 150000, aplicaSobre: 'base' },
      { categoria: 'Frenos', nombre: '4 frenos', tipoModificador: 'fijo', valor: 300000, aplicaSobre: 'base' },
      { categoria: 'Homologación', nombre: 'Homologado', tipoModificador: 'porcentual', valor: 15, aplicaSobre: 'subtotal' },
      { categoria: 'Ejes', nombre: 'Eje reforzado', tipoModificador: 'fijo', valor: 400000, aplicaSobre: 'base' },
      { categoria: 'Descuentos', nombre: 'Descuento por pago de contado', tipoModificador: 'porcentual', valor: -5, aplicaSobre: 'subtotal' }
    ].map(item => ({ ...item, claseId: CLASE_TRAILERS })))
    const categorias = await db.categorias.toArray()
    for (const categoria of categorias) {
      await db.variables.where('categoria').equals(categoria.nombre).modify({ categoriaId: categoria.id })
    }
  })
}
