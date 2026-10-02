import { useState, useRef, useMemo, useEffect, useId } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, exportarBackup, analizarBackup, combinarBackup, actualizarPreciosPorcentaje } from '../db/database'
import { validarTipoTrailer } from '../utils/validaciones'
import { claseDe, perteneceAClase, nombreClase } from '../utils/clasesProductos'
import { guardarVariable } from '../db/catalogo'
import { formatoARS } from '../utils/formato'
import { guardarArchivo } from '../utils/guardarArchivo'
import SelectorClase from '../components/SelectorClase'
import AdminClases from '../components/AdminClases'
import ExportarCatalogo from '../components/ExportarCatalogo'
import AdminCategorias from '../components/AdminCategorias'
import Inspector from '../components/Inspector'
import SelectorOrden from '../components/SelectorOrden'
import { EnShell } from '../components/Shell'
import { ordenar, compararPor } from '../utils/ordenar'
import { useToast } from '../components/Toast'

const SECCIONES = [
  { id: 'tipos', label: 'Tipos de producto', nuevo: '+ Nuevo tipo' },
  { id: 'categorias', label: 'Categorías', nuevo: '+ Nueva categoría' },
  { id: 'variables', label: 'Variables', nuevo: '+ Nueva variable' },
  { id: 'clases', label: 'Clases' },
  { id: 'ajuste', label: 'Ajuste masivo' }
]

const formatoGanancia = g => `×${(Number(g) || 1).toLocaleString('es-AR')}`

export default function Admin({ claseId, clases }) {
  const [orden, setOrden] = useState('nombre-asc')
  const [seccion, setSeccion] = useState('variables')
  // Cada clic en "+ Nuevo..." incrementa el contador: la sección suelta la
  // fila elegida y el inspector vuelve a un alta vacía.
  const [nuevo, setNuevo] = useState(0)
  const tipos = useLiveQuery(() => db.tiposTrailer.filter(item => perteneceAClase(item, claseId)).toArray(), [claseId]) ?? []
  const categorias = useLiveQuery(() => db.categorias.filter(item => perteneceAClase(item, claseId)).toArray(), [claseId]) ?? []
  const variables = useLiveQuery(() => db.variables.filter(item => perteneceAClase(item, claseId)).toArray(), [claseId]) ?? []
  const conteos = { tipos: tipos.length, categorias: categorias.length, variables: variables.length, clases: clases.length }
  const actual = SECCIONES.find(s => s.id === seccion)
  const comunes = { claseId, clases, orden, setOrden, nuevo }

  return (
    <div className="pagina">
      <div className="barra-pagina barra-pagina-con-pestanas">
        <div className="barra-pagina-fila">
          <div className="barra-pagina-titulo">
            <h1>Catálogo</h1>
            <span className="meta">Clase: {nombreClase(clases, claseId)}</span>
          </div>
          <div className="barra-pagina-acciones">
            <ExportarCatalogo />
            <BackupRestore />
            {actual.nuevo && (
              <button type="button" className="btn-primario" onClick={() => setNuevo(n => n + 1)}>{actual.nuevo}</button>
            )}
          </div>
        </div>
        <nav className="pestanas" aria-label="Secciones del catálogo">
          {SECCIONES.map(s => (
            <button
              key={s.id}
              type="button"
              className="pestana"
              aria-current={s.id === seccion ? 'page' : undefined}
              onClick={() => setSeccion(s.id)}
            >
              {s.label}
              {conteos[s.id] !== undefined && <span className="pestana-conteo">{conteos[s.id]}</span>}
            </button>
          ))}
        </nav>
      </div>

      <div className="pagina-cuerpo">
        {seccion === 'tipos' && <AdminTiposTrailer tipos={tipos} {...comunes} />}
        {seccion === 'categorias' && <AdminCategorias categorias={categorias} {...comunes} />}
        {seccion === 'variables' && <AdminVariables variables={variables} {...comunes} />}
        {seccion === 'clases' && <AdminClases clases={clases} />}
        {seccion === 'ajuste' && <AjustePreciosMasivo claseId={claseId} />}
      </div>

      <EnShell zona="estado">
        <span>{variables.length} variables · {categorias.length} categorías · {tipos.length} tipos</span>
        <span>Clase: {nombreClase(clases, claseId)}</span>
      </EnShell>
    </div>
  )
}

/** Suelta la fila elegida cuando se pide un alta nueva desde la barra de la página. */
function useSeleccion(nuevo) {
  const [seleccion, setSeleccion] = useState(null)
  useEffect(() => setSeleccion(null), [nuevo])
  return [seleccion, setSeleccion]
}

function AjustePreciosMasivo({ claseId }) {
  const tipos = useLiveQuery(() => db.tiposTrailer.filter(item => perteneceAClase(item, claseId)).toArray(), [claseId]) ?? []
  const variablesFijas = useLiveQuery(
    () => db.variables.where('tipoModificador').equals('fijo').and(item => perteneceAClase(item, claseId)).toArray(),
    [claseId]
  ) ?? []
  const showToast = useToast()
  const [porcentaje, setPorcentaje] = useState('')
  const [aplicando, setAplicando] = useState(false)
  // Set de ids EXCLUIDOS del ajuste. Vacío = todo seleccionado (default).
  const [tiposExcluidos, setTiposExcluidos] = useState(new Set())
  const [variablesExcluidas, setVariablesExcluidas] = useState(new Set())

  const tiposOrdenados = [...tipos].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  const variablesOrdenadas = [...variablesFijas].sort((a, b) => {
    const porCategoria = a.categoria.localeCompare(b.categoria, 'es')
    return porCategoria !== 0 ? porCategoria : a.nombre.localeCompare(b.nombre, 'es')
  })

  function toggle(setExcluidos, id) {
    setExcluidos(prev => {
      const nuevo = new Set(prev)
      if (nuevo.has(id)) nuevo.delete(id)
      else nuevo.add(id)
      return nuevo
    })
  }

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

    const idsTipos = tiposOrdenados.filter(t => !tiposExcluidos.has(t.id)).map(t => t.id)
    const idsVariables = variablesOrdenadas.filter(v => !variablesExcluidas.has(v.id)).map(v => v.id)

    if (idsTipos.length === 0 && idsVariables.length === 0) {
      showToast('Seleccioná al menos un tipo de producto o variable.', 'error')
      return
    }

    const accion = pct > 0 ? 'aumentar' : 'disminuir'
    const confirmado = confirm(
      `Esto va a ${accion} un ${Math.abs(pct)}% el precio base/valor fijo de ` +
      `${idsTipos.length} tipo(s) de producto y ${idsVariables.length} variable(s) ` +
      `marcadas (no afecta a las variables porcentuales). ` +
      `Esta acción no se puede deshacer, salvo restaurando un backup. ¿Continuar?`
    )
    if (!confirmado) return

    setAplicando(true)
    try {
      const { tiposActualizados, variablesActualizadas } = await actualizarPreciosPorcentaje(pct, idsTipos, idsVariables)
      showToast(
        `Precios actualizados: ${tiposActualizados} tipos de producto y ${variablesActualizadas} variables.`
      )
      setPorcentaje('')
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setAplicando(false)
    }
  }

  return (
    <section className="panel">
      <h2 className="panel-titulo">Ajuste masivo de precios</h2>
      <div className="panel-cuerpo pila">
        <p className="texto-ayuda">
          Aumenta o disminuye de una sola vez el precio base y el valor fijo ($)
          de los tipos de producto y variables que dejes marcados abajo. Las
          variables en porcentaje (%) nunca se modifican. Se recomienda
          descargar un backup antes de aplicar un ajuste masivo.
        </p>

        <div className="checklist-ajuste">
          <div className="checklist-ajuste-columna">
            <div className="checklist-ajuste-cabecera">
              <span>Tipos de producto</span>
              <button type="button" className="btn-secundario btn-chico" onClick={() => setTiposExcluidos(new Set())}>Todos</button>
              <button type="button" className="btn-secundario btn-chico" onClick={() => setTiposExcluidos(new Set(tiposOrdenados.map(t => t.id)))}>Ninguno</button>
            </div>
            {tiposOrdenados.map(t => (
              <label key={t.id} className="checkbox-inline">
                <input
                  type="checkbox"
                  checked={!tiposExcluidos.has(t.id)}
                  onChange={() => toggle(setTiposExcluidos, t.id)}
                />
                {t.nombre}
              </label>
            ))}
          </div>

          <div className="checklist-ajuste-columna">
            <div className="checklist-ajuste-cabecera">
              <span>Variables (monto fijo)</span>
              <button type="button" className="btn-secundario btn-chico" onClick={() => setVariablesExcluidas(new Set())}>Todas</button>
              <button type="button" className="btn-secundario btn-chico" onClick={() => setVariablesExcluidas(new Set(variablesOrdenadas.map(v => v.id)))}>Ninguna</button>
            </div>
            {variablesOrdenadas.map(v => (
              <label key={v.id} className="checkbox-inline">
                <input
                  type="checkbox"
                  checked={!variablesExcluidas.has(v.id)}
                  onChange={() => toggle(setVariablesExcluidas, v.id)}
                />
                <span className="texto-tenue">{v.categoria}</span> {v.nombre}
              </label>
            ))}
          </div>
        </div>

        <div className="form-inline">
          <label className="campo">
            Porcentaje
            <input
              type="number"
              placeholder="Ej: 10 (aumenta) o -5 (baja)"
              value={porcentaje}
              onChange={e => setPorcentaje(e.target.value)}
            />
          </label>
          <button type="button" className="btn-solido" onClick={aplicar} disabled={aplicando}>
            {aplicando ? 'Aplicando...' : 'Aplicar ajuste'}
          </button>
        </div>
      </div>
    </section>
  )
}

function AdminTiposTrailer({ tipos, claseId, clases, orden, setOrden, nuevo }) {
  const [seleccion, setSeleccion] = useSeleccion(nuevo)
  const actual = tipos.find(t => t.id === seleccion) ?? null

  return (
    <div className="maestro-detalle">
      <section className="panel">
        <div className="panel-cabecera">
          <h2 className="panel-titulo">Tipos de producto</h2>
          <SelectorOrden value={orden} onChange={setOrden} />
        </div>
        {tipos.length === 0 ? (
          <p className="panel-vacio">Todavía no hay tipos de producto en esta clase.</p>
        ) : (
          <div className="tabla-scroll">
            <table className="tabla tabla-catalogo">
              <thead>
                <tr>
                  <th scope="col">Nombre</th>
                  <th scope="col">Clase</th>
                  <th scope="col" className="col-num">Precio base</th>
                  <th scope="col" className="col-num">Ganancia</th>
                  <th scope="col" className="col-num">Precio al cliente</th>
                </tr>
              </thead>
              <tbody>
                {ordenar(tipos, orden).map(t => (
                  <tr key={t.id} className={t.id === seleccion ? 'seleccionada' : undefined} onClick={() => setSeleccion(t.id)}>
                    <td><button type="button" className="btn-fila" onClick={() => setSeleccion(t.id)}>{t.nombre}</button></td>
                    <td><span className="etiqueta-clase">{nombreClase(clases, claseDe(t))}</span></td>
                    <td className="col-num price-num">{formatoARS.format(t.precioBase)}</td>
                    <td className="col-num price-num">{formatoGanancia(t.ganancia)}</td>
                    <td className="col-num price-num">{formatoARS.format(t.precioBase * (Number(t.ganancia) || 1))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <FormTipo
        key={actual?.id ?? `nuevo-${nuevo}`}
        tipo={actual}
        claseId={claseId}
        clases={clases}
        enfocar={nuevo > 0 && !actual}
        onCerrar={() => setSeleccion(null)}
      />
    </div>
  )
}

function FormTipo({ tipo, claseId, clases, enfocar, onCerrar }) {
  const showToast = useToast()
  const vacio = { claseId, nombre: '', precioBase: '', ganancia: '' }
  const [datos, setDatos] = useState(() => tipo
    ? { claseId: claseDe(tipo), nombre: tipo.nombre, precioBase: String(tipo.precioBase), ganancia: String(tipo.ganancia ?? 1) }
    : vacio)
  const [error, setError] = useState(null)
  const cambiar = campo => e => { setDatos({ ...datos, [campo]: e.target.value }); setError(null) }
  const precioCliente = Number(datos.precioBase) * (Number(datos.ganancia) || 1)

  async function guardar(e) {
    e.preventDefault()
    const err = validarTipoTrailer(datos)
    if (err) { setError(err); return }
    const registro = { claseId: datos.claseId, nombre: datos.nombre.trim(), precioBase: Number(datos.precioBase), ganancia: Number(datos.ganancia) || 1 }
    if (tipo) {
      await db.tiposTrailer.update(tipo.id, registro)
      showToast('Cambios guardados')
      onCerrar()
    } else {
      await db.tiposTrailer.add(registro)
      setDatos(vacio)
      showToast('Tipo de producto agregado')
    }
  }

  async function eliminar() {
    if (confirm('¿Eliminar este tipo de producto?')) {
      await db.tiposTrailer.delete(tipo.id)
      showToast('Eliminado', 'info')
      onCerrar()
    }
  }

  return (
    <Inspector
      titulo={tipo ? tipo.nombre : 'Nuevo tipo de producto'}
      onSubmit={guardar}
      onCancelar={tipo ? onCerrar : null}
      onEliminar={tipo ? eliminar : null}
      error={error}
      textoGuardar={tipo ? 'Guardar' : 'Agregar'}
    >
      <SelectorClase clases={clases} value={datos.claseId} onChange={valor => setDatos({ ...datos, claseId: valor })} />
      <label className="campo">
        Nombre
        <input autoFocus={enfocar} value={datos.nombre} onChange={cambiar('nombre')} placeholder="Ej: Batea" />
      </label>
      <div className="grilla-2">
        <label className="campo">
          Precio base (costo)
          <input type="number" className="input-num" value={datos.precioBase} onChange={cambiar('precioBase')} />
        </label>
        <label className="campo">
          Ganancia
          <input type="number" step="0.01" className="input-num" placeholder="Ej: 1.25" value={datos.ganancia} onChange={cambiar('ganancia')} />
        </label>
      </div>
      <div className="dato-calculado">
        <span>Precio al cliente</span>
        <span className="price-num">{datos.precioBase !== '' && Number.isFinite(precioCliente) ? formatoARS.format(precioCliente) : '—'}</span>
      </div>
    </Inspector>
  )
}

function AdminVariables({ variables, claseId, clases, orden, setOrden, nuevo }) {
  const [seleccion, setSeleccion] = useSeleccion(nuevo)
  const [busqueda, setBusqueda] = useState('')
  const busquedaId = useId()
  // Todas las categorías: el formulario puede mover la variable a otra clase.
  const categorias = useLiveQuery(() => db.categorias.toArray(), []) ?? []
  const actual = variables.find(v => v.id === seleccion) ?? null

  const variablesOrdenadas = useMemo(() => {
    const termino = busqueda.trim().toLowerCase()
    const filtradas = termino
      ? variables.filter(v =>
          v.nombre.toLowerCase().includes(termino) || v.categoria.toLowerCase().includes(termino)
        )
      : variables
    const comparar = compararPor(orden)
    return [...filtradas].sort((a, b) => a.categoria.localeCompare(b.categoria, 'es') || comparar(a, b))
  }, [variables, busqueda, orden])

  function atributos(v) {
    const lista = []
    if (v.tipoModificador === 'porcentual') lista.push(v.aplicaSobre === 'subtotal' ? 'Sobre subtotal' : 'Sobre base')
    if (v.permiteCantidad) lista.push('Admite cantidad')
    if (v.esOpcional) lista.push('Opcional')
    return lista.join(' · ') || '—'
  }

  return (
    <div className="maestro-detalle">
      <section className="panel">
        <div className="panel-cabecera">
          <h2 className="panel-titulo">Variables</h2>
          <div className="grupo-filtros">
            <label className="campo-oculto" htmlFor={busquedaId}>Buscar variable</label>
            <input
              id={busquedaId}
              type="search"
              className="input-busqueda"
              placeholder="Buscar por nombre o categoría"
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
            />
            <SelectorOrden value={orden} onChange={setOrden} />
          </div>
        </div>
        {variablesOrdenadas.length === 0 ? (
          <p className="panel-vacio">
            {busqueda ? `Sin resultados para "${busqueda}".` : 'Todavía no hay variables en esta clase.'}
          </p>
        ) : (
          <div className="tabla-scroll">
            <table className="tabla tabla-catalogo">
              <thead>
                <tr>
                  <th scope="col">Categoría</th>
                  <th scope="col">Variable</th>
                  <th scope="col">Clase</th>
                  <th scope="col" className="col-num">Valor</th>
                  <th scope="col" className="col-num">Ganancia</th>
                  <th scope="col">Atributos</th>
                </tr>
              </thead>
              <tbody>
                {variablesOrdenadas.map(v => (
                  <tr key={v.id} className={v.id === seleccion ? 'seleccionada' : undefined} onClick={() => setSeleccion(v.id)}>
                    <td className="texto-suave">{v.categoria}</td>
                    <td><button type="button" className="btn-fila" onClick={() => setSeleccion(v.id)}>{v.nombre}</button></td>
                    <td><span className="etiqueta-clase">{nombreClase(clases, claseDe(v))}</span></td>
                    <td className="col-num price-num">
                      {v.tipoModificador === 'fijo' ? formatoARS.format(v.valor) : `${v.valor >= 0 ? '+' : '−'}${Math.abs(v.valor)} %`}
                    </td>
                    <td className="col-num price-num">{v.tipoModificador === 'fijo' ? formatoGanancia(v.ganancia) : '—'}</td>
                    <td className="texto-suave">{atributos(v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <FormVariable
        key={actual?.id ?? `nuevo-${nuevo}`}
        variable={actual}
        categorias={categorias}
        claseId={claseId}
        clases={clases}
        enfocar={nuevo > 0 && !actual}
        onCerrar={() => setSeleccion(null)}
      />
    </div>
  )
}

function FormVariable({ variable, categorias, claseId, clases, enfocar, onCerrar }) {
  const showToast = useToast()
  const vacio = {
    claseId, categoriaId: '', nombre: '', tipoModificador: 'fijo', valor: '', ganancia: '',
    aplicaSobre: 'base', permiteCantidad: false, esOpcional: false
  }
  const [datos, setDatos] = useState(() => {
    if (!variable) return vacio
    // Solo los descuentos porcentuales se editan en positivo (guardarVariable
    // re-invierte el signo al guardar). El resto muestra su valor tal cual,
    // para no convertir silenciosamente un valor negativo en positivo.
    const esDescuentoPorcentual = variable.tipoModificador === 'porcentual' &&
      !!categorias.find(c => c.id === variable.categoriaId)?.esDescuento
    return {
      claseId: claseDe(variable), categoriaId: variable.categoriaId ?? '', nombre: variable.nombre,
      tipoModificador: variable.tipoModificador,
      valor: String(esDescuentoPorcentual ? Math.abs(variable.valor) : variable.valor),
      ganancia: String(variable.ganancia ?? 1), aplicaSobre: variable.aplicaSobre ?? 'base',
      permiteCantidad: !!variable.permiteCantidad, esOpcional: !!variable.esOpcional
    }
  })
  const [nuevaCategoria, setNuevaCategoria] = useState(null)
  const [error, setError] = useState(null)
  const [guardando, setGuardando] = useState(false)

  const categoriasCompatibles = [...categorias]
    .filter(cat => perteneceAClase(cat, datos.claseId))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  const precioCliente = Number(datos.valor) * (Number(datos.ganancia) || 1)

  function cambiar(cambios) {
    setDatos(prev => ({ ...prev, ...cambios }))
    setError(null)
  }

  function cambiarClase(nuevaClase) {
    const categoria = categorias.find(c => c.id === Number(datos.categoriaId))
    cambiar({ claseId: nuevaClase, categoriaId: categoria && perteneceAClase(categoria, nuevaClase) ? categoria.id : '' })
    if (nuevaCategoria && !perteneceAClase({ claseId: nuevaCategoria.claseId }, nuevaClase)) {
      setNuevaCategoria({ ...nuevaCategoria, claseId: nuevaClase })
    }
  }

  async function guardar(e) {
    e.preventDefault()
    setGuardando(true)
    try {
      await guardarVariable(
        { ...datos, id: variable?.id },
        nuevaCategoria ? { nombre: nuevaCategoria.nombre, claseId: nuevaCategoria.claseId, esDescuento: nuevaCategoria.esDescuento } : null
      )
      if (variable) {
        showToast('Cambios guardados')
        onCerrar()
      } else {
        setDatos(vacio)
        setNuevaCategoria(null)
        setError(null)
        showToast('Variable agregada')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  async function eliminar() {
    if (confirm('¿Eliminar esta variable?')) {
      await db.variables.delete(variable.id)
      showToast('Eliminada', 'info')
      onCerrar()
    }
  }

  return (
    <Inspector
      titulo={variable ? variable.nombre : 'Nueva variable'}
      onSubmit={guardar}
      onCancelar={variable ? onCerrar : null}
      onEliminar={variable ? eliminar : null}
      error={error}
      guardando={guardando}
      textoGuardar={guardando ? 'Guardando…' : variable ? 'Guardar' : 'Agregar'}
    >
      <label className="campo">
        Nombre
        <input autoFocus={enfocar} value={datos.nombre} onChange={e => cambiar({ nombre: e.target.value })} placeholder="Ej: 4 frenos" />
      </label>
      <div className="grilla-2">
        <SelectorClase clases={clases} value={datos.claseId} onChange={cambiarClase} label="Clase de la variable" />
        <label className="campo">
          Categoría
          <select
            aria-label="Categoría de la variable"
            value={nuevaCategoria ? '__nueva__' : datos.categoriaId}
            onChange={e => {
              setError(null)
              if (e.target.value === '__nueva__') {
                setNuevaCategoria({ nombre: '', claseId: datos.claseId, esDescuento: false })
                cambiar({ categoriaId: '' })
              } else {
                setNuevaCategoria(null)
                cambiar({ categoriaId: e.target.value === '' ? '' : Number(e.target.value) })
              }
            }}
          >
            <option value="">Seleccionar categoría...</option>
            {categoriasCompatibles.map(cat => (
              <option key={cat.id} value={cat.id}>{cat.nombre} ({nombreClase(clases, claseDe(cat))})</option>
            ))}
            <option value="__nueva__">+ Agregar nueva categoría</option>
          </select>
        </label>
      </div>
      {nuevaCategoria && (
        <fieldset className="subformulario">
          <legend>Nueva categoría</legend>
          <label className="campo">
            Nombre de la nueva categoría
            <input value={nuevaCategoria.nombre} onChange={e => { setNuevaCategoria({ ...nuevaCategoria, nombre: e.target.value }); setError(null) }} />
          </label>
          <SelectorClase
            clases={clases.filter(c => perteneceAClase({ claseId: c.id }, datos.claseId))}
            value={nuevaCategoria.claseId}
            onChange={valor => setNuevaCategoria({ ...nuevaCategoria, claseId: valor })}
            label="Clase de la nueva categoría"
          />
          <label className="checkbox-inline">
            <input type="checkbox" checked={nuevaCategoria.esDescuento} onChange={e => setNuevaCategoria({ ...nuevaCategoria, esDescuento: e.target.checked })} />
            Es de descuento
          </label>
          <button type="button" className="btn-secundario btn-chico" onClick={() => setNuevaCategoria(null)}>Usar una categoría existente</button>
        </fieldset>
      )}
      <div className="grilla-2">
        <label className="campo">
          Tipo
          <select value={datos.tipoModificador} onChange={e => cambiar({ tipoModificador: e.target.value })}>
            <option value="fijo">Monto fijo ($)</option>
            <option value="porcentual">Porcentaje (%)</option>
          </select>
        </label>
        <label className="campo">
          Valor
          <input type="number" className="input-num" value={datos.valor} onChange={e => cambiar({ valor: e.target.value })} />
        </label>
        {datos.tipoModificador === 'fijo' ? (
          <>
            <label className="campo">
              Ganancia
              <input type="number" step="0.01" className="input-num" placeholder="Ej: 1.25" value={datos.ganancia} onChange={e => cambiar({ ganancia: e.target.value })} />
            </label>
            <div className="dato-calculado dato-calculado-celda">
              <span>Precio al cliente</span>
              <span className="price-num">{datos.valor !== '' && Number.isFinite(precioCliente) ? formatoARS.format(precioCliente) : '—'}</span>
            </div>
          </>
        ) : (
          <label className="campo">
            Se aplica sobre
            <select value={datos.aplicaSobre} onChange={e => cambiar({ aplicaSobre: e.target.value })}>
              <option value="base">Precio base</option>
              <option value="subtotal">Subtotal</option>
            </select>
          </label>
        )}
      </div>
      <label className="checkbox-inline">
        <input type="checkbox" checked={datos.permiteCantidad} onChange={e => cambiar({ permiteCantidad: e.target.checked })} />
        Permite cargar cantidad
      </label>
      <label className="checkbox-inline">
        <input type="checkbox" checked={datos.esOpcional} onChange={e => cambiar({ esOpcional: e.target.checked })} />
        Es opcional
      </label>
    </Inspector>
  )
}

function BackupRestore() {
  const showToast = useToast()
  const inputRef = useRef(null)
  const dialogo = useRef(null)
  const tituloId = useId()

  async function exportar() {
    try {
      const data = await exportarBackup()
      // Diálogo nativo en la app instalada: el WebView no maneja descargas de <a download>.
      const guardado = await guardarArchivo(new TextEncoder().encode(JSON.stringify(data, null, 2)), {
        nombre: `backup-cotizador-trailers-${new Date().toISOString().slice(0, 10)}.json`,
        mime: 'application/json', extension: 'json', descripcion: 'Backup del cotizador'
      })
      if (guardado) showToast('Backup guardado')
    } catch (err) {
      showToast(`No se pudo guardar el backup: ${err.message}`, 'error')
    }
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

      const totalNuevos = analisis.clasesProductos.nuevos.length + analisis.tiposTrailer.nuevos.length + analisis.categorias.nuevos.length +
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
      dialogo.current?.close()
    } catch (err) {
      showToast('No se pudo restaurar: ' + err.message, 'error')
    } finally {
      e.target.value = ''
    }
  }

  return (
    <>
      <button type="button" className="btn-secundario" onClick={() => dialogo.current?.showModal()}>Backup</button>
      <dialog ref={dialogo} className="dialogo" aria-labelledby={tituloId}>
        <h3 id={tituloId}>Backup y restauración</h3>
        <p>
          Como todos los datos viven en esta computadora, se recomienda exportar
          un backup periódicamente (por ejemplo, antes de una actualización o
          un cambio de equipo). Al restaurar, los datos del backup se combinan
          con los actuales: no se elimina nada de esta computadora.
        </p>
        <div className="dialogo-acciones">
          <button type="button" className="btn-secundario" onClick={() => dialogo.current?.close()}>Cerrar</button>
          <button type="button" className="btn-secundario" onClick={elegirArchivo}>Actualizar con backup</button>
          <button type="button" className="btn-solido" onClick={exportar}>Descargar backup (JSON)</button>
        </div>
        <input
          type="file"
          accept="application/json"
          ref={inputRef}
          hidden
          onChange={onArchivoSeleccionado}
        />
      </dialog>
    </>
  )
}
