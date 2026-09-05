# Handoff — Cotizador de Trailers

> Documento para retomar el proyecto en otra sesión/agente sin contexto previo.
> Última actualización: 2026-08-08, HEAD en `3df90d8` ("arreglando bug de descarga"), versión de la app `0.1.7`.

## Qué es esto

App de escritorio (React + Tauri) para que el personal administrativo de **BINA
Maquinarias** arme cotizaciones de trailers a medida: elige un tipo de
trailer base y le suma variables configurables (frenos, ejes, homologación,
pintura, accesorios, descuentos), calcula el precio final, y lo exporta a
PDF. Todo corre 100% local — sin backend, sin login, sin internet. Un único
operador por instalación; los datos viven en IndexedDB dentro de esa
máquina.

Lectura obligatoria antes de tocar producto/UX: **`PRODUCT.md`** (propósito,
usuarios, principios de producto — offline-first no negociable, backup nunca
reemplaza sin confirmar, el motor de precios es la única fuente de verdad).
Para el detalle de requerimientos funcionales: **`CHECKLIST_REQUERIMIENTOS.md`**.

## Stack técnico

- **Frontend**: React 18 + Vite 5, sin router (tabs manejadas a mano en `App.jsx`), CSS plano (sin CSS-in-JS ni Tailwind).
- **Persistencia**: Dexie (wrapper de IndexedDB), `src/db/database.js`.
- **Empaquetado desktop**: Tauri v2 (Rust), `src-tauri/`. Es la única forma de distribución real al cliente (ver `README.md` para el modo "PWA en navegador" alternativo, que existe pero es secundario).
- **PDF**: jsPDF, cargado con `import()` dinámico (no infla el bundle inicial).
- **PWA**: `vite-plugin-pwa` (service worker, manifest) — vive en paralelo al build de Tauri.

## Cómo correr / compilar

```bash
npm install
npm run dev              # Vite dev server en localhost:5173 (navegador normal)
npm run tauri:dev        # misma app pero dentro de la ventana de Tauri (WebView2)
npm run build             # build de producción del frontend -> dist/
npm run tauri:build       # instalador de escritorio completo (usa dist/, tarda varios minutos)
```

**Importante**: "correr en localhost" (navegador real) y "correr en la app
instalada" (WebView2 embebido) **no son equivalentes** — hay funcionalidad de
navegador (como la descarga de blobs) que no anda igual dentro del webview
empaquetado. Ver "Gotchas" más abajo.

## Estructura de archivos

```
src/
  db/database.js          -> Dexie: definición de tablas + migraciones versionadas + backup/restore
  utils/calcularPrecio.js -> motor de cálculo de precio (única fuente de verdad, no duplicar en otras vistas)
  utils/generarPdf.js     -> generación de PDF (cotización individual y comparativa) + guardado (ver gotcha de Tauri)
  utils/seleccionVariables.js, validaciones.js, formato.js, imagenes.js
  components/SelectorVariables.jsx, Toast.jsx, ErrorBoundary.jsx, CampoObservaciones.jsx
  pages/Cotizador.jsx      -> pantalla principal: arma la cotización, layout de dos columnas (form + panel lateral con precio)
  pages/Comparativa.jsx    -> compara varios tipos de trailer lado a lado, con borrador auto-guardado
  pages/Admin.jsx          -> alta/baja/edición de tipos de trailer, categorías y variables; backup/restore; ajuste masivo de precios
  pages/Historial.jsx      -> cotizaciones guardadas: búsqueda, filtro por fecha, duplicar, exportar PDF
  App.jsx                  -> shell: header + nav de tabs + toggle de tema claro/oscuro
  index.css                -> design tokens (--paper, --ink, --accent*, --band*, etc.) por tema claro/oscuro
  App.css                  -> todo el CSS de layout/componentes (623+ líneas), importado global

src-tauri/
  src/lib.rs               -> entry point Rust: registro de plugins (log, dialog, fs)
  tauri.conf.json          -> config de bundle, versión, ventana, recursos incluidos en el instalador
  capabilities/default.json -> permisos habilitados para el webview (core, dialog, fs)
  Cargo.toml               -> versión + dependencias Rust
```

Otros archivos relevantes en la raíz:
- `PRODUCT.md` — contexto de producto (ver arriba).
- `CHECKLIST_REQUERIMIENTOS.md` — checklist funcional detallado, con líneas de código referenciadas.
- `PLAN_REDISENO_ESCRITORIO.md` — plan de rediseño para aprovechar ancho de escritorio; **ya ejecutado** (el layout de dos columnas en Cotizador y `.page { max-width: 1200px }` en `App.css` son el resultado).
- `datos-demo.json` — catálogo de ejemplo **ficticio** (inventado para poder mostrar/probar la app). No confundir con datos reales de BINA Maquinarias, no usar como evidencia de reglas de negocio reales.
- `BINA MAQUINARIAS LOGO_2026_Mesa de trabajo 1 copia.png` — logo oficial del cliente, usado en header de la app y en el PDF.
- `.impeccable/critique/` — reportes de auditorías de UX/diseño hechas con el skill `/impeccable` (histórico, ver sección más abajo).

## Modelo de datos (Dexie, `src/db/database.js`)

Tablas: `tiposTrailer`, `categorias`, `variables`, `cotizaciones`, `config`
(clave-valor, ej. redondeo del precio final, borrador de Comparativa).

Migraciones ya aplicadas (no reordenar ni editar versiones viejas; agregar
la próxima como `db.version(6)`):
- v2: esquema base.
- v3: separa `categorias` en tabla propia (antes vivían como string suelto en cada variable).
- v4: `cliente` en cotizaciones pasa de string a objeto `{nombreCliente, razonSocial, cuit}`.
- v5: `categorias` gana el flag `esDescuento` (reemplaza la heurística "el nombre contiene 'descuento'").

**Backup/restore** (`exportarBackup`/`analizarBackup`/`combinarBackup`):
formato JSON `{version, fechaExportacion, tiposTrailer, categorias, variables, cotizaciones, config}`.
El import **combina, nunca reemplaza**: separa registros nuevos de
duplicados (por nombre normalizado, o categoría+nombre para variables) y
pregunta antes de sobrescribir. Este comportamiento es un principio de
producto explícito (ver `PRODUCT.md`), no cambiarlo sin confirmar con el
usuario.

## Motor de cálculo (`src/utils/calcularPrecio.js`)

- `calcularPrecio(tipoTrailer, variables, redondeo)`: precio base + suma de
  modificadores `fijo` (pueden tener `cantidad`) + modificadores
  `porcentual` (aplicados sobre `base` o `subtotal` según cada variable).
- `calcularPrecioConGanancia(...)`: corre `calcularPrecio` dos veces — una
  para el costo real, otra sobre precios ya multiplicados por el margen de
  ganancia (`ganancia` en tipoTrailer y en variables fijas) — así el % de
  las variables porcentuales se calcula sobre el precio que ve el cliente,
  no sobre el costo interno.
- `desglosarEstandarYOpcionales(...)`: separa precio estándar (incluido) de
  adicionales opcionales, usado en Cotizador y en los PDFs.

Cualquier vista nueva que muestre precio **debe** pasar por estas
funciones — es el principio "el motor de precios es la única fuente de
verdad" de `PRODUCT.md`.

## Estado actual (2026-08-08)

Versión: **0.1.7**, consistente en `package.json`, `src-tauri/tauri.conf.json`,
`src-tauri/Cargo.toml` y `src-tauri/Cargo.lock` (este último se
autorregenera con cada `cargo build`/`cargo check`, no hace falta tocarlo a
mano). Todo está commiteado en `3df90d8` — `git status` da working tree
limpio.

### Los dos bugs de release que se arreglaron en esta sesión

1. **App instalada no abría — "WebView2Loader.dll no encontrado"**. Causa
   raíz: un commit anterior (`1683283`) había quitado de
   `src-tauri/tauri.conf.json` el bloque que bundlea esa dll dentro del
   instalador:
   ```json
   "resources": { "target/release/WebView2Loader.dll": "" }
   ```
   Se sacó porque en una máquina sin builds previos el primer
   `tauri:build` fallaba (la dll todavía no existe la primerísima vez, antes
   de que `cargo build` la genere). La "solución" rompió el instalador para
   todos los usuarios finales. **Fix**: se restauró el bloque `resources`.
   Si alguna vez el primer build en una máquina nueva vuelve a fallar por
   esto, correr `cargo build --release` una vez dentro de `src-tauri` (o
   repetir `tauri:build`) y ya queda resuelto — es solo una molestia de la
   primera compilación, nunca afecta a los usuarios.

2. **Los PDF no se descargaban en la app instalada** (sí andaban en
   localhost/navegador). Causa raíz: `jsPDF.save()` arma un blob + un
   `<a download>` y lo clickea programáticamente — un navegador real lo
   intercepta con su gestor de descargas, pero el WebView2 embebido de
   Tauri no tiene un manejador de descargas por defecto, así que el click
   no hacía nada, en silencio. **Fix**: se agregaron los plugins oficiales
   `@tauri-apps/plugin-dialog` y `@tauri-apps/plugin-fs` (+ `@tauri-apps/api`
   como dependencia directa), registrados en `src-tauri/src/lib.rs` y
   habilitados en `src-tauri/capabilities/default.json`
   (`dialog:default`, `fs:default`, `fs:allow-write-file`). En
   `src/utils/generarPdf.js` se agregó `guardarPdf(doc, nombreArchivo)`:
   si `isTauri()` es true, abre el diálogo nativo "Guardar como" y escribe
   el archivo con `writeFile`; si no (dev/navegador), sigue usando
   `doc.save()` como antes. Los dos `doc.save(...)` originales (cotización
   individual y comparativa) ahora llaman a este helper.

Ambos fixes están verificados con `npm run build` (frontend) y
`cargo check` / `cargo build --release` (Rust) limpios, y la dll ya está
presente en `target/release/`.

### Pendiente para cerrar el release 0.1.7

- **No se corrió `npm run tauri:build` todavía** (el instalador final con
  ambos fixes no se generó en esta sesión — solo se compiló el binario
  Rust suelto para validar). Es el próximo paso antes de redistribuir al
  cliente.
- Después de generar el instalador, probarlo en una máquina limpia (o al
  menos reinstalar sobre una existente) y confirmar en la app instalada
  real: (a) que abre sin el error de WebView2Loader, (b) que "Descargar
  PDF" en Cotizador/Historial/Comparativa abre el diálogo nativo y guarda
  el archivo correctamente.
- El usuario mencionó un "botón de descarga" (para que los usuarios
  bajen/instalen la app) que "no hace nada" — **no se encontró en este
  repo** ningún botón de ese tipo (solo hay botones de "Descargar PDF",
  que son otra cosa y ya están cubiertos arriba). Es probable que viva en
  un sitio/página externa (no versionada acá) desde donde se distribuye el
  instalador. Falta confirmar con el usuario dónde está para poder
  revisarlo.

## Gotchas conocidos

- **`src-tauri/Cargo.lock`**: se deja sin tocar a mano en los bumps de
  versión — se autorregenera solo con `cargo build`/`cargo check`/
  `tauri:build`. Si un bump de versión no corrió ningún build de Rust
  después, puede quedar desactualizado (no rompe nada, solo hay que
  recordar correr `cargo check` antes de dar por cerrado el bump).
- **`datos-demo.json`** es ficticio (inventado para demos). Si aparece una
  aparente inconsistencia de reglas de negocio (ej. dos variables
  mutuamente excluyentes que el modelo actual deja seleccionar juntas), es
  muy probable que sea un artefacto de datos falsos y no un bug real —
  confirmar con el usuario antes de "arreglarlo".
- **Localhost (navegador) ≠ app instalada (WebView2)**: cualquier feature
  que dependa de comportamiento estándar de navegador (descargas, clipboard,
  notificaciones, etc.) hay que probarla en la app empaquetada, no alcanza
  con probarla en `npm run dev`. Ver el bug de PDF de arriba como ejemplo
  concreto.
- **Tokens de tema** (`src/index.css`): hay pares de variables que se
  re-tematizan juntas en modo oscuro (ej. `--accent-soft` +
  `--accent-ink`, ambas terminan oscuras) — si se usan mal emparejadas
  (ej. texto `--accent-ink` sobre fondo `--accent-soft`) el contraste
  colapsa en dark mode aunque se vea bien en claro. El par seguro para
  texto sobre fondos temáticos es `--ink` (invierte correctamente en ambos
  temas). Ya hubo un bug así en la fila de TOTAL de Comparativa, corregido.

## Sesiones anteriores relevantes (para no repetir trabajo)

- Se corrió `/impeccable init` (genera `PRODUCT.md`) y `/impeccable critique`
  sobre `src/pages/Cotizador.jsx` (reporte persistido en
  `.impeccable/critique/2026-07-25T23-01-50Z__src-pages-cotizador-jsx.md`,
  score 21/40). De los hallazgos, el usuario **descartó explícitamente**
  el P1 (checkboxes de frenos contradictorios — era artefacto de
  `datos-demo.json`, no bug real) y un P2 sobre jerarquía del panel de
  costo/margen (decidió dejarlo como está). Los demás se implementaron:
  tope de cantidad (999) en variables, tamaño de fuente de labels chicas
  (0.72rem → 0.8rem), label accesible en el buscador de variables, mensaje
  de error genérico en `ErrorBoundary` (con detalle técnico colapsado en
  `<details>`).
- Se creó `datos-demo.json` para que el usuario pueda mostrar el programa
  con datos de ejemplo realistas (vía "Actualizar con backup" en Admin).
- Se ejecutó el plan de `PLAN_REDISENO_ESCRITORIO.md` (layout de dos
  columnas en Cotizador, anchos ampliados para pantalla de escritorio).

## Preferencias de trabajo del usuario (para la próxima sesión)

- Los mensajes del usuario suelen ser directivas breves en español; conviene
  responder también en español y ser concreto/accionable.
- El usuario corrige activamente hallazgos de auditorías cuando están
  basados en datos ficticios o no los entiende — vale la pena confirmar
  antes de implementar un fix "de diseño" que dependa de datos de ejemplo.
- Ante bugs de build/release, el patrón esperado es: diagnosticar la causa
  raíz (no solo el síntoma reportado), aplicar el fix mínimo, verificar con
  build/compilación real antes de reportar como resuelto.
