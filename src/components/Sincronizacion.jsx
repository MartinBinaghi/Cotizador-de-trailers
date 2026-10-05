import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import { db } from '../db/database'
import { sincronizarCarpeta, cambiosLocales, priorizarDatosLocales, PREFIJO_ARCHIVO } from '../db/sincronizacion'
import { useToast } from './Toast'

const INTERVALO_MS = 30_000
const ESPERA_TRAS_CAMBIO_MS = 2_000
const SincronizacionContext = createContext(null)

/** Acceso a la carpeta compartida con el plugin de archivos de Tauri. */
async function ioCarpeta(ruta) {
  const [fs, { join }] = await Promise.all([import('@tauri-apps/plugin-fs'), import('@tauri-apps/api/path')])
  return {
    async listar() {
      const archivos = (await fs.readDir(ruta)).filter(e => e.isFile && e.name.startsWith(PREFIJO_ARCHIVO) && e.name.endsWith('.json'))
      return Promise.all(archivos.map(async e => ({
        nombre: e.name,
        modificado: (await fs.stat(await join(ruta, e.name))).mtime?.getTime() ?? 0
      })))
    },
    leer: async nombre => fs.readTextFile(await join(ruta, nombre)),
    async escribir(nombre, texto) {
      // Escribir aparte y renombrar: el Drive nunca sube un archivo a medio escribir.
      const destino = await join(ruta, nombre)
      await fs.writeTextFile(`${destino}.tmp`, texto)
      await fs.rename(`${destino}.tmp`, destino)
    }
  }
}

async function obtenerEquipo() {
  const registro = await db.config.get('equipoSync')
  if (registro) return registro.valor
  const equipo = crypto.randomUUID().slice(0, 8)
  await db.config.put({ clave: 'equipoSync', valor: equipo })
  return equipo
}

export function SincronizacionProvider({ children }) {
  const disponible = isTauri()
  const [carpeta, setCarpeta] = useState(null)
  const [estado, setEstado] = useState({ fase: 'inactiva', ultima: null, error: null, equipos: [] })
  const enCurso = useRef(null)
  const hayCambiosLocales = useRef(true)
  const leidos = useRef(new Map())

  useEffect(() => {
    if (disponible) db.config.get('carpetaCompartida').then(r => setCarpeta(r?.valor ?? null))
  }, [disponible])

  const sincronizar = useCallback(async ({ releer = false } = {}) => {
    if (!carpeta) return
    if (enCurso.current) return enCurso.current
    if (releer) leidos.current = new Map()
    enCurso.current = (async () => {
      setEstado(e => ({ ...e, fase: 'sincronizando' }))
      const escribir = hayCambiosLocales.current
      hayCambiosLocales.current = false
      try {
        const resultado = await sincronizarCarpeta(db, await ioCarpeta(carpeta), {
          equipo: await obtenerEquipo(), escribir, leidos: leidos.current
        })
        setEstado({ fase: 'ok', ultima: new Date(), error: null, equipos: resultado.equipos })
      } catch (err) {
        if (escribir) hayCambiosLocales.current = true
        setEstado(e => ({ ...e, fase: 'error', error: err?.message ?? String(err) }))
      } finally {
        enCurso.current = null
      }
    })()
    return enCurso.current
  }, [carpeta])

  useEffect(() => {
    if (!carpeta) return
    sincronizar()
    let espera = null
    const alCambiar = () => {
      hayCambiosLocales.current = true
      clearTimeout(espera)
      espera = setTimeout(() => sincronizar(), ESPERA_TRAS_CAMBIO_MS)
    }
    const alVolver = () => sincronizar()
    const intervalo = setInterval(() => sincronizar(), INTERVALO_MS)
    cambiosLocales.addEventListener('cambio', alCambiar)
    window.addEventListener('focus', alVolver)
    return () => {
      clearTimeout(espera)
      clearInterval(intervalo)
      cambiosLocales.removeEventListener('cambio', alCambiar)
      window.removeEventListener('focus', alVolver)
    }
  }, [carpeta, sincronizar])

  async function conectar(ruta, { priorizarLocal }) {
    if (priorizarLocal) await priorizarDatosLocales(db)
    await db.config.put({ clave: 'carpetaCompartida', valor: ruta })
    leidos.current = new Map()
    hayCambiosLocales.current = true
    setCarpeta(ruta)
  }

  async function desconectar() {
    await db.config.delete('carpetaCompartida')
    setCarpeta(null)
    setEstado({ fase: 'inactiva', ultima: null, error: null, equipos: [] })
  }

  /** Cantidad de otros equipos que ya escriben en esa carpeta. */
  async function contarOtrosEquipos(ruta) {
    const propio = `${PREFIJO_ARCHIVO}${await obtenerEquipo()}.json`
    return (await (await ioCarpeta(ruta)).listar()).filter(a => a.nombre !== propio).length
  }

  return (
    <SincronizacionContext.Provider value={{ disponible, carpeta, estado, sincronizar, conectar, desconectar, contarOtrosEquipos }}>
      {children}
    </SincronizacionContext.Provider>
  )
}

export const useSincronizacion = () => useContext(SincronizacionContext)

const hora = fecha => fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })

/** Indicador de la barra de título. */
export function IndicadorSincronizacion() {
  const { carpeta, estado } = useSincronizacion()
  const texto = !carpeta ? 'Base de datos local'
    : estado.fase === 'error' ? 'Error al sincronizar'
    : estado.fase === 'ok' ? `Carpeta compartida · ${hora(estado.ultima)}`
    : 'Sincronizando…'
  return (
    <span className="indicador-local" title={estado.error ?? carpeta ?? 'Los datos se guardan solo en esta computadora'}>
      <span className={`indicador-punto indicador-${carpeta ? estado.fase : 'inactiva'}`} />
      {texto}
    </span>
  )
}

/** Botón del Catálogo que abre la configuración de la carpeta compartida. */
export function CarpetaCompartida() {
  const { disponible, carpeta, estado, sincronizar, conectar, desconectar, contarOtrosEquipos } = useSincronizacion()
  const showToast = useToast()
  const dialogo = useRef(null)
  const tituloId = useId()
  const [eleccion, setEleccion] = useState(null)
  const [ocupado, setOcupado] = useState(false)

  async function ejecutar(accion) {
    setOcupado(true)
    try { await accion() } catch (err) { showToast(err?.message ?? String(err), 'error') } finally { setOcupado(false) }
  }

  const elegirCarpeta = () => ejecutar(async () => {
    const { open } = await import('@tauri-apps/plugin-dialog')
    // recursive: autoriza a la app a leer y escribir dentro de la carpeta elegida.
    const ruta = await open({ directory: true, recursive: true, title: 'Elegí la carpeta compartida' })
    if (!ruta) return
    const otros = await contarOtrosEquipos(ruta)
    if (otros === 0) {
      await conectar(ruta, { priorizarLocal: true })
      showToast('Carpeta compartida configurada')
    } else {
      setEleccion({ ruta, otros })
    }
  })

  const confirmar = priorizarLocal => ejecutar(async () => {
    await conectar(eleccion.ruta, { priorizarLocal })
    setEleccion(null)
    showToast('Carpeta compartida configurada')
  })

  const dejar = () => ejecutar(async () => {
    if (!confirm('Esta computadora va a dejar de compartir datos. Los datos locales y los archivos de la carpeta se conservan. ¿Continuar?')) return
    await desconectar()
    showToast('Se dejó de compartir', 'info')
  })

  const otrosEquipos = estado.equipos.filter(e => !e.propio)

  return (
    <>
      <button type="button" className="btn-secundario" onClick={() => dialogo.current?.showModal()}>Carpeta compartida</button>
      <dialog ref={dialogo} className="dialogo" aria-labelledby={tituloId} onClose={() => setEleccion(null)}>
        <h3 id={tituloId}>Carpeta compartida</h3>

        {!disponible ? (
          <p>Disponible en la aplicación de escritorio.</p>
        ) : eleccion ? (
          <>
            <p>
              La carpeta ya tiene datos de {eleccion.otros} equipo{eleccion.otros === 1 ? '' : 's'}. Se van a
              combinar: lo que exista solo en un lado se agrega al otro. Si un mismo dato es distinto en los
              dos lados, ¿qué versión querés conservar?
            </p>
            <p className="ruta-carpeta">{eleccion.ruta}</p>
            <div className="dialogo-acciones">
              <button type="button" className="btn-secundario" disabled={ocupado} onClick={() => setEleccion(null)}>Cancelar</button>
              <button type="button" className="btn-secundario" disabled={ocupado} onClick={() => confirmar(true)}>Los de esta computadora</button>
              <button type="button" className="btn-solido" disabled={ocupado} onClick={() => confirmar(false)}>Los de la carpeta</button>
            </div>
          </>
        ) : carpeta ? (
          <>
            <p>
              Catálogo e historial se comparten con los otros equipos que usan esta carpeta. Se sincroniza
              al abrir, cada 30 segundos y después de cada cambio. Si dos personas cambian el mismo dato,
              queda el cambio más reciente.
            </p>
            <p className="ruta-carpeta">{carpeta}</p>
            <dl className="datos-sincronizacion">
              <dt>Estado</dt>
              <dd className={estado.fase === 'error' ? 'error-texto' : undefined}>
                {estado.fase === 'error' ? estado.error
                  : estado.fase === 'ok' ? `Sincronizado a las ${hora(estado.ultima)}`
                  : 'Sincronizando…'}
              </dd>
              <dt>Otros equipos</dt>
              <dd>
                {otrosEquipos.length === 0 ? 'Ninguno todavía'
                  : otrosEquipos.map(e => `actualizado ${new Date(e.modificado).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}`).join(' · ')}
              </dd>
            </dl>
            <div className="dialogo-acciones">
              <button type="button" className="btn-peligro" disabled={ocupado} onClick={dejar}>Dejar de compartir</button>
              <button type="button" className="btn-secundario" onClick={() => dialogo.current?.close()}>Cerrar</button>
              <button type="button" className="btn-solido" disabled={ocupado || estado.fase === 'sincronizando'}
                onClick={() => ejecutar(() => sincronizar({ releer: true }))}>Sincronizar ahora</button>
            </div>
          </>
        ) : (
          <>
            <p>
              Elegí una carpeta del Drive de la empresa (la que se ve en el Explorador de Windows) para que
              varias computadoras compartan catálogo e historial. Cada equipo escribe su propio archivo en
              esa carpeta y lee los de los demás.
            </p>
            <p className="texto-ayuda">Recomendado: descargá un backup antes de conectar por primera vez.</p>
            <div className="dialogo-acciones">
              <button type="button" className="btn-secundario" onClick={() => dialogo.current?.close()}>Cerrar</button>
              <button type="button" className="btn-solido" disabled={ocupado} onClick={elegirCarpeta}>Elegir carpeta…</button>
            </div>
          </>
        )}
      </dialog>
    </>
  )
}
