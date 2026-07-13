import { useState, useEffect, useRef, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, exportarBackup, analizarBackup, combinarBackup, getRedondeo, setRedondeo, actualizarPreciosPorcentaje } from '../db/database'
import { validarTipoTrailer, validarVariable } from '../utils/validaciones'
import { useToast } from '../components/Toast'

export default function Admin() {
  return (
    <div className="page">
      <h2>Administrar catálogo</h2>
      <ConfigRedondeo />
      <AjustePreciosMasivo />
      <AdminTiposTrailer />
      <AdminVariables />
      <BackupRestore />
    </div>
  )
}

function AjustePreciosMasivo() {
  const showToast = useToast()
  const [porcentaje, setPorcentaje] = useState('')
  const [aplicando, setAplicando] = useState(false)

  async function aplicar() {
    const pct = Number(porcentaje)

    if (porcentaje === '' || Number.isNaN(pct)) {
      showToast('Ingresá un porcentaje válido.', 'error')
      return
    }
    if (pct === 0) {
      showToast('El porcentaje tiene que ser distinto de 0.', 'error')
      return
    }

    const accion = pct > 0 ? 'aumentar' : 'disminuir'
    const confirmado = confirm(
      `Esto va a ${accion} un ${Math.abs(pct)}% TODOS los precios base y valores fijos ` +
      `del catálogo (no afecta a las variables porcentuales). ` +
      `Esta acción no se puede deshacer, salvo restaurando un backup. ¿Continuar?`
    )
    if (!confirmado) return

    setAplicando(true)
    try {
      const { tiposActualizados, variablesActualizadas } = await actualizarPreciosPorcentaje(pct)
      showToast(
        `Precios actualizados: ${tiposActualizados} tipos de trailer y ${variablesActualizadas} variables.`
      )
      setPorcentaje('')
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setAplicando(false)
    }
  }

  return (
    <section className="admin-seccion">
      <h3>Ajuste masivo de precios</h3>
      <p className="texto-ayuda">
        Aumenta o disminuye de una sola vez el precio base de todos los
        tipos de trailer y el valor de las variables en pesos ($). Las
        variables en porcentaje (%) no se modifican. Se recomienda
        descargar un backup antes de aplicar un ajuste masivo.
      </p>
      <div className="form-inline">
        <input
          type="number"
          placeholder="Ej: 10 (aumenta 10%) o -5 (baja 5%)"
          value={porcentaje}
          onChange={e => setPorcentaje(e.target.value)}
        />
        <button onClick={aplicar} disabled={aplicando}>
          {aplicando ? 'Aplicando...' : 'Aplicar ajuste'}
        </button>
      </div>
    </section>
  )
}

function ConfigRedondeo() {
  const showToast = useToast()
  const [redondeo, setRedondeoLocal] = useState(1)

  useEffect(() => {
    getRedondeo().then(setRedondeoLocal)
  }, [])

  async function cambiar(e) {
    const valor = Number(e.target.value)
    setRedondeoLocal(valor)
    await setRedondeo(valor)
    showToast('Preferencia de redondeo guardada')
  }

  return (
    <section className="admin-seccion">
      <h3>Redondeo del precio final</h3>
      <select value={redondeo} onChange={cambiar}>
        <option value={1}>Sin redondeo</option>
        <option value={100}>Redondear a $100</option>
        <option value={1000}>Redondear a $1.000</option>
        <option value={10000}>Redondear a $10.000</option>
      </select>
    </section>
  )
}

function AdminTiposTrailer() {
  const tipos = useLiveQuery(() => db.tiposTrailer.toArray(), []) ?? []
  const showToast = useToast()

  const [nombre, setNombre] = useState('')
  const [precioBase, setPrecioBase] = useState('')
  const [error, setError] = useState(null)

  const [editandoId, setEditandoId] = useState(null)
  const [editNombre, setEditNombre] = useState('')
  const [editPrecio, setEditPrecio] = useState('')

  async function agregar() {
    const datos = { nombre, precioBase }
    const err = validarTipoTrailer(datos)
    if (err) { setError(err); return }
    setError(null)
    await db.tiposTrailer.add({ nombre: nombre.trim(), precioBase: Number(precioBase) })
    setNombre('')
    setPrecioBase('')
    showToast('Tipo de trailer agregado')
  }

  async function eliminar(id) {
    if (confirm('¿Eliminar este tipo de trailer?')) {
      await db.tiposTrailer.delete(id)
      showToast('Eliminado', 'info')
    }
  }

  function empezarEdicion(t) {
    setEditandoId(t.id)
    setEditNombre(t.nombre)
    setEditPrecio(String(t.precioBase))
  }

  async function guardarEdicion(id) {
    const err = validarTipoTrailer({ nombre: editNombre, precioBase: editPrecio })
    if (err) { showToast(err, 'error'); return }
    await db.tiposTrailer.update(id, { nombre: editNombre.trim(), precioBase: Number(editPrecio) })
    setEditandoId(null)
    showToast('Cambios guardados')
  }

  return (
    <section className="admin-seccion">
      <h3>Tipos de trailer</h3>
      <ul className="lista-admin">
        {tipos.map(t => (
          <li key={t.id}>
            {editandoId === t.id ? (
              <div className="form-inline">
                <input value={editNombre} onChange={e => setEditNombre(e.target.value)} />
                <input type="number" value={editPrecio} onChange={e => setEditPrecio(e.target.value)} />
                <button onClick={() => guardarEdicion(t.id)}>Guardar</button>
                <button className="btn-secundario" onClick={() => setEditandoId(null)}>Cancelar</button>
              </div>
            ) : (
              <>
                <span>{t.nombre} — ${t.precioBase.toLocaleString('es-AR')}</span>
                <span className="acciones">
                  <button className="btn-secundario" onClick={() => empezarEdicion(t)}>Editar</button>
                  <button className="btn-peligro" onClick={() => eliminar(t.id)}>Eliminar</button>
                </span>
              </>
            )}
          </li>
        ))}
      </ul>
      <div className="form-inline">
        <input placeholder="Nombre (ej: Batea)" value={nombre} onChange={e => setNombre(e.target.value)} />
        <input placeholder="Precio base" type="number" value={precioBase} onChange={e => setPrecioBase(e.target.value)} />
        <button onClick={agregar}>Agregar</button>
      </div>
      {error && <p className="error-texto">{error}</p>}
    </section>
  )
}

function AdminVariables() {
  const variables = useLiveQuery(() => db.variables.toArray(), []) ?? []
  const categorias = useLiveQuery(() => db.categorias.toArray(), []) ?? []
  const showToast = useToast()

  const [categoria, setCategoria] = useState('')
  const [nombre, setNombre] = useState('')
  const [tipoModificador, setTipoModificador] = useState('fijo')
  const [valor, setValor] = useState('')
  const [aplicaSobre, setAplicaSobre] = useState('base')
  const [permiteCantidad, setPermiteCantidad] = useState(false)
  const [esOpcional, setEsOpcional] = useState(false)
  const [error, setError] = useState(null)
  const [mostrarNuevaCategoria, setMostrarNuevaCategoria] = useState(false)
  const [nuevaCategoria, setNuevaCategoria] = useState('')
  const [busquedaAdmin, setBusquedaAdmin] = useState('')

  const [editandoId, setEditandoId] = useState(null)
  const [editVar, setEditVar] = useState(null)

  const categoriasExistentes = [...new Set(categorias.map(c => c.nombre))].sort()

  const variablesOrdenadas = useMemo(() => {
    const termino = busquedaAdmin.trim().toLowerCase()
    const filtradas = termino
      ? variables.filter(v =>
          v.nombre.toLowerCase().includes(termino) || v.categoria.toLowerCase().includes(termino)
        )
      : variables
    return [...filtradas].sort((a, b) => {
      const comparacionCategoria = a.categoria.localeCompare(b.categoria, 'es')
      if (comparacionCategoria !== 0) return comparacionCategoria
      return a.nombre.localeCompare(b.nombre, 'es')
    })
  }, [variables, busquedaAdmin])

  // Función auxiliar para aplicar lógica de descuento
  function procesarValor(valor, categoriaUsada, tipo) {
    let val = Number(valor)
    // Si es categoría que contiene "descuento" (case-insensitive) y es porcentual, invertir el signo
    if (categoriaUsada?.toLowerCase().includes('descuento') && tipo === 'porcentual' && val > 0) {
      val = -val
    }
    return val
  }

  async function asegurarCategoriaExistente(nombreCategoria) {
    const categoriaNormalizada = nombreCategoria.trim()
    if (!categoriaNormalizada) return

    const yaExiste = categorias.some(
      c => c.nombre.trim().toLowerCase() === categoriaNormalizada.toLowerCase()
    )

    if (!yaExiste) {
      await db.categorias.add({ nombre: categoriaNormalizada })
    }
  }

  async function agregar() {
    const catFinal = mostrarNuevaCategoria ? nuevaCategoria.trim() : categoria.trim()
    if (!catFinal) {
      setError('Selecciona o ingresa una categoría')
      return
    }
    
    const datos = { categoria: catFinal, nombre, valor, tipoModificador }
    const err = validarVariable(datos)
    if (err) { setError(err); return }
    setError(null)
    
    const valorFinal = procesarValor(valor, catFinal, tipoModificador)
        await asegurarCategoriaExistente(catFinal)
    
    await db.variables.add({
      categoria: catFinal,
      nombre: nombre.trim(),
      tipoModificador,
      valor: valorFinal,
      aplicaSobre,
      permiteCantidad,
      esOpcional
    })
    setCategoria('')
    setNombre('')
    setValor('')
    setNuevaCategoria('')
    setMostrarNuevaCategoria(false)
    setPermiteCantidad(false)
    setEsOpcional(false)
    showToast('Variable agregada')
  }

  async function eliminar(id) {
    if (confirm('¿Eliminar esta variable?')) {
      await db.variables.delete(id)
      showToast('Eliminada', 'info')
    }
  }

  function empezarEdicion(v) {
    setEditandoId(v.id)
    setEditVar({ ...v, valor: String(Math.abs(v.valor)), permiteCantidad: !!v.permiteCantidad, esOpcional: !!v.esOpcional })
  }

  async function guardarEdicion(id) {
    const err = validarVariable(editVar)
    if (err) { showToast(err, 'error'); return }

    const valorFinal = procesarValor(editVar.valor, editVar.categoria, editVar.tipoModificador)
    await asegurarCategoriaExistente(editVar.categoria)

    await db.variables.update(id, {
      categoria: editVar.categoria.trim(),
      nombre: editVar.nombre.trim(),
      tipoModificador: editVar.tipoModificador,
      valor: valorFinal,
      aplicaSobre: editVar.aplicaSobre,
      permiteCantidad: !!editVar.permiteCantidad,
      esOpcional: !!editVar.esOpcional
    })
    setEditandoId(null)
    showToast('Cambios guardados')
  }

  return (
    <section className="admin-seccion">
      <h3>Variables (frenos, homologación, etc.)</h3>
      <input
        className="buscador-variables"
        placeholder="Buscar variable por nombre o categoría..."
        value={busquedaAdmin}
        onChange={e => setBusquedaAdmin(e.target.value)}
      />
      {busquedaAdmin && variablesOrdenadas.length === 0 && (
        <p className="texto-ayuda">Sin resultados para "{busquedaAdmin}".</p>
      )}
      <ul className="lista-admin">
        {variablesOrdenadas.map(v => (
          <li key={v.id}>
            {editandoId === v.id ? (
              <div className="form-inline">
                <select value={editVar.categoria} onChange={e => setEditVar({ ...editVar, categoria: e.target.value })}>
                  <option value="">Seleccionar categoría...</option>
                  {categoriasExistentes.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
                <input value={editVar.nombre} onChange={e => setEditVar({ ...editVar, nombre: e.target.value })} />
                <select value={editVar.tipoModificador} onChange={e => setEditVar({ ...editVar, tipoModificador: e.target.value })}>
                  <option value="fijo">Monto fijo ($)</option>
                  <option value="porcentual">Porcentaje (%)</option>
                </select>
                <input type="number" value={editVar.valor} onChange={e => setEditVar({ ...editVar, valor: e.target.value })} />
                {editVar.tipoModificador === 'porcentual' && (
                  <select value={editVar.aplicaSobre} onChange={e => setEditVar({ ...editVar, aplicaSobre: e.target.value })}>
                    <option value="base">% sobre base</option>
                    <option value="subtotal">% sobre subtotal</option>
                  </select>
                )}
                <label className="checkbox-inline">
                  <input
                    type="checkbox"
                    checked={!!editVar.permiteCantidad}
                    onChange={e => setEditVar({ ...editVar, permiteCantidad: e.target.checked })}
                  />
                  Permite cargar cantidad
                </label>
                <label className="checkbox-inline">
                  <input
                    type="checkbox"
                    checked={!!editVar.esOpcional}
                    onChange={e => setEditVar({ ...editVar, esOpcional: e.target.checked })}
                  />
                  Es opcional
                </label>
                <button onClick={() => guardarEdicion(v.id)}>Guardar</button>
                <button className="btn-secundario" onClick={() => setEditandoId(null)}>Cancelar</button>
              </div>
            ) : (
              <>
                <span>
                  [{v.categoria}] {v.nombre} — {v.tipoModificador === 'fijo' ? `$${v.valor.toLocaleString('es-AR')}` : `${v.valor >= 0 ? '+' : ''}${v.valor}%`}
                  {v.permiteCantidad && <span className="etiqueta-cantidad"> (admite cantidad)</span>}
                  {v.esOpcional && <span className="etiqueta-opcional"> (opcional)</span>}
                </span>
                <span className="acciones">
                  <button className="btn-secundario" onClick={() => empezarEdicion(v)}>Editar</button>
                  <button className="btn-peligro" onClick={() => eliminar(v.id)}>Eliminar</button>
                </span>
              </>
            )}
          </li>
        ))}
      </ul>
      <div className="form-inline">
        {mostrarNuevaCategoria ? (
          <>
            <input 
              placeholder="Nueva categoría" 
              value={nuevaCategoria} 
              onChange={e => { setNuevaCategoria(e.target.value); setError(null) }}
              autoFocus
            />
            <button 
              className="btn-secundario" 
              onClick={() => { setNuevaCategoria(''); setCategoria(''); setMostrarNuevaCategoria(false) }}
              type="button"
            >
              Cancelar
            </button>
          </>
        ) : (
          <select value={categoria} onChange={e => {
            setError(null)
            if (e.target.value === '__nueva__') {
              setNuevaCategoria('')
              setMostrarNuevaCategoria(true)
              setCategoria('')
            } else {
              setCategoria(e.target.value)
              setMostrarNuevaCategoria(false)
            }
          }}>
            <option value="">Seleccionar categoría...</option>
            {categoriasExistentes.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
            <option value="__nueva__">+ Agregar nueva categoría</option>
          </select>
        )}
        <input 
          placeholder="Nombre (ej: 4 frenos)" 
          value={nombre} 
          onChange={e => { setNombre(e.target.value); setError(null) }}
        />
        <select value={tipoModificador} onChange={e => { setTipoModificador(e.target.value); setError(null) }}>
          <option value="fijo">Monto fijo ($)</option>
          <option value="porcentual">Porcentaje (%)</option>
        </select>
        <input 
          placeholder="Valor" 
          type="number" 
          value={valor} 
          onChange={e => { setValor(e.target.value); setError(null) }}
        />
        {tipoModificador === 'porcentual' && (
          <select value={aplicaSobre} onChange={e => { setAplicaSobre(e.target.value); setError(null) }}>
            <option value="base">% sobre precio base</option>
            <option value="subtotal">% sobre subtotal</option>
          </select>
        )}
        <label className="checkbox-inline">
          <input
            type="checkbox"
            checked={permiteCantidad}
            onChange={e => setPermiteCantidad(e.target.checked)}
          />
          Permite cargar cantidad
        </label>
        <label className="checkbox-inline">
          <input
            type="checkbox"
            checked={esOpcional}
            onChange={e => setEsOpcional(e.target.checked)}
          />
          Es opcional
        </label>
        <button onClick={agregar}>Agregar</button>
      </div>
      {error && <p className="error-texto">{error}</p>}
    </section>
  )
}

function BackupRestore() {
  const showToast = useToast()
  const inputRef = useRef(null)

  async function exportar() {
    const data = await exportarBackup()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `backup-cotizador-trailers-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    showToast('Backup descargado')
  }

  function elegirArchivo() {
    inputRef.current?.click()
  }

  async function onArchivoSeleccionado(e) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const texto = await file.text()
      const data = JSON.parse(texto)
      const analisis = await analizarBackup(data)

      const totalNuevos = analisis.tiposTrailer.nuevos.length + analisis.categorias.nuevos.length +
        analisis.variables.nuevos.length + analisis.cotizaciones.nuevos.length
      const totalDuplicados = analisis.tiposTrailer.duplicados.length + analisis.categorias.duplicados.length +
        analisis.variables.duplicados.length + analisis.cotizaciones.duplicados.length

      if (totalNuevos === 0 && totalDuplicados === 0) {
        showToast('El backup no tiene datos para combinar.', 'info')
        return
      }

      if (!confirm(
        `Se van a combinar los datos del backup con los actuales (no se elimina nada de esta computadora). ` +
        `Se encontraron ${totalNuevos} elementos nuevos` +
        (totalDuplicados > 0 ? ` y ${totalDuplicados} que ya existen localmente. ` : '. ') +
        `¿Continuar?`
      )) {
        return
      }

      let sobrescribirDuplicados = false
      if (totalDuplicados > 0) {
        sobrescribirDuplicados = confirm(
          `Hay ${totalDuplicados} elementos que ya existen (mismo nombre/datos). ` +
          `Aceptar = sobrescribirlos con los datos del backup. Cancelar = mantener los datos actuales sin cambios.`
        )
      }

      const resumen = await combinarBackup(analisis, sobrescribirDuplicados)
      showToast(
        `Backup combinado: ${resumen.agregados} agregados, ${resumen.sobrescritos} sobrescritos, ${resumen.mantenidos} mantenidos sin cambios.`
      )
    } catch (err) {
      showToast('No se pudo restaurar: ' + err.message, 'error')
    } finally {
      e.target.value = ''
    }
  }

  return (
    <section className="admin-seccion">
      <h3>Backup y restauración</h3>
      <p className="texto-ayuda">
        Como todos los datos viven en esta computadora, se recomienda exportar
        un backup periódicamente (por ejemplo, antes de una actualización o
        un cambio de equipo). Al restaurar, los datos del backup se combinan
        con los actuales: no se elimina nada de esta computadora.
      </p>
      <div className="form-inline">
        <button onClick={exportar}>Descargar backup (JSON)</button>
        <button className="btn-secundario" onClick={elegirArchivo}>Combinar con backup</button>
        <input
          type="file"
          accept="application/json"
          ref={inputRef}
          style={{ display: 'none' }}
          onChange={onArchivoSeleccionado}
        />
      </div>
    </section>
  )
}
