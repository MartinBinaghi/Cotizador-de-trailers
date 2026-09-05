import { db } from './database.js'
import { claseDe, normalizarNombre, validarClaseCategoria } from '../utils/clasesProductos.js'
import { validarVariable } from '../utils/validaciones.js'

export async function guardarCategoria(datos) {
  if (!datos.nombre?.trim()) throw new Error('El nombre de la categoría es obligatorio.')
  return db.transaction('rw', db.clasesProductos, db.categorias, db.variables, async () => {
    if (!await db.clasesProductos.get(datos.claseId)) throw new Error('Seleccioná una clase válida.')
    const repetida = await db.categorias.filter(c => c.id !== datos.id && claseDe(c) === datos.claseId &&
      normalizarNombre(c.nombre) === normalizarNombre(datos.nombre)).first()
    if (repetida) throw new Error('Ya existe una categoría con ese nombre en esta clase.')
    const registro = { nombre: datos.nombre.trim(), claseId: datos.claseId, esDescuento: !!datos.esDescuento }
    if (!datos.id) return db.categorias.add(registro)
    const incompatibles = await db.variables.where('categoriaId').equals(datos.id)
      .filter(variable => !!validarClaseCategoria(variable, registro)).toArray()
    if (incompatibles.length) {
      throw new Error(`No se puede cambiar la clase: ${incompatibles.length} variable(s) quedarían en una categoría incompatible. Mové esas variables a otra categoría compatible o dejá esta categoría como Universal.`)
    }
    await db.categorias.update(datos.id, registro)
    await db.variables.where('categoriaId').equals(datos.id).modify({ categoria: registro.nombre })
    return datos.id
  })
}

export async function guardarVariable(datos, nuevaCategoria = null) {
  return db.transaction('rw', db.clasesProductos, db.categorias, db.variables, async () => {
    if (!await db.clasesProductos.get(datos.claseId)) throw new Error('Seleccioná una clase válida.')
    let categoria = nuevaCategoria
      ? { ...nuevaCategoria, nombre: nuevaCategoria.nombre.trim() }
      : datos.categoriaId ? await db.categorias.get(Number(datos.categoriaId)) : null
    const incompatibilidad = validarClaseCategoria(datos, categoria)
    if (incompatibilidad) throw new Error(incompatibilidad)
    if (nuevaCategoria) {
      if (!await db.clasesProductos.get(categoria.claseId)) throw new Error('Seleccioná una clase válida para la categoría.')
      const existente = await db.categorias.filter(c => claseDe(c) === categoria.claseId &&
        normalizarNombre(c.nombre) === normalizarNombre(categoria.nombre)).first()
      if (existente) categoria = existente
    }
    const error = validarVariable({ ...datos, categoria: categoria.nombre }, categoria.esDescuento)
    if (error) throw new Error(error)
    if (!categoria.id) categoria.id = await db.categorias.add(categoria)
    const valor = Number(datos.valor)
    const registro = {
      claseId: datos.claseId, categoriaId: categoria.id, categoria: categoria.nombre,
      nombre: datos.nombre.trim(), tipoModificador: datos.tipoModificador,
      valor: categoria.esDescuento && datos.tipoModificador === 'porcentual' ? -Math.abs(valor) : valor,
      ganancia: Number(datos.ganancia) || 1, aplicaSobre: datos.aplicaSobre,
      permiteCantidad: !!datos.permiteCantidad, esOpcional: !!datos.esOpcional
    }
    if (!datos.id) return db.variables.add(registro)
    await db.variables.update(datos.id, registro)
    return datos.id
  })
}
