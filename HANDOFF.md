# Handoff — Cotizador de Trailers

> Documento para retomar el proyecto en otra sesión/agente sin contexto previo.
> Última actualización: 2026-10-02, HEAD en `554b134` ("algunos cambios minimos"), último release publicado `v0.1.9`.
> **Ojo:** el bump a 0.1.9 todavía no está commiteado (ver "Pendientes").

## Qué es esto

App de escritorio (React + Tauri) para que el personal administrativo de **BINA
Maquinarias** arme cotizaciones de productos a medida (trailers, cajas, etc.):
elige una clase de producto y un tipo base, le suma variables configurables
(frenos, ejes, homologación, pintura, accesorios, descuentos), calcula el precio
final y lo exporta a PDF. Todo corre 100% local — sin backend, sin login, sin
internet. Un único operador por instalación; los datos viven en IndexedDB
dentro de esa máquina.

Lectura obligatoria antes de tocar producto/UX: **`PRODUCT.md`** (propósito,
usuarios, principios de producto — offline-first no negociable, backup nunca
reemplaza sin confirmar, el motor de precios es la única fuente de verdad).
Para el detalle de requerimientos funcionales: **`CHECKLIST_REQUERIMIENTOS.md`**.

## Stack técnico

- **Frontend**: React 18 + Vite 5, sin router (tabs manejadas a mano en `App.jsx`), CSS plano (sin CSS-in-JS ni Tailwind).
- **Persistencia**: Dexie (wrapper de IndexedDB), `src/db/database.js`.
- **Empaquetado desktop**: Tauri v2 (Rust), `src-tauri/`. Es la única forma de distribución real al cliente (ver `README.md` para el modo "PWA en navegador" alternativo, que existe pero es secundario).
- **PDF**: jsPDF, cargado con `import()` dinámico (no infla el bundle inicial).
- **Excel**: `exceljs` (exportar catálogo completo a `.xlsx`).
- **PWA**: `vite-plugin-pwa` (service worker, manifest) — vive en paralelo al build de Tauri.
- **Tests**: `node --test` + `fake-indexeddb` (unitarios) y Playwright con Edge (UI).

## Cómo correr / compilar / testear

```bash
npm install
npm run dev              # Vite dev server en localhost:5173 (navegador normal)
npm run tauri:dev        # misma app pero dentro de la ventana de Tauri (WebView2); la 1ra vez compila Rust (varios min)
npm run build            # build de producción del frontend -> dist/
npm run tauri:build      # instalador de escritorio completo (usa dist/, tarda varios minutos)
npm test                 # tests unitarios: tests/*.test.js
npm run test:ui          # tests de UI Playwright: tests/ui/ (levanta Vite en 127.0.0.1:5187, usa Edge)
```

**Importante**: "correr en localhost" (navegador real) y "correr en la app
instalada" (WebView2 embebido) **no son equivalentes** — hay funcionalidad de
navegador (como la descarga de blobs) que no anda igual dentro del webview
empaquetado. Ver "Gotchas" más abajo.

## Estructura de archivos

```
src/
  db/database.js           -> Dexie: tablas + migraciones versionadas + borradores/redondeo
  db/backup.js             -> exportarBackup / analizarBackup / combinarBackup (re-exportados desde database.js)
  db/catalogo.js           -> guardarCategoria / guardarVariable (validan clase y categoría)
  db/eliminarClase.js      -> borrado de una clase de producto (el historial conserva sus cotizaciones)
  utils/calcularPrecio.js  -> motor de cálculo de precio (única fuente de verdad, no duplicar en otras vistas)
  utils/clasesProductos.js -> constantes de clases y reglas (claseDe, perteneceAClase, validarClaseCategoria)
  utils/ordenar.js         -> OPCIONES_ORDEN, compararPor, ordenar (selector "Ordenar por")
  utils/generarPdf.js      -> PDF (cotización individual y comparativa)
  utils/guardarArchivo.js  -> guardado de archivos: diálogo nativo en Tauri, descarga normal en navegador
  utils/exportarCatalogoExcel.js, seleccionVariables.js, validaciones.js, formato.js, imagenes.js
  components/SelectorVariables.jsx -> variables agrupadas por categoría, con buscador y prop `orden`
  components/SelectorClase.jsx, SelectorOrden.jsx, EspacioClase.jsx, AdminClases.jsx, AdminCategorias.jsx,
             ExportarCatalogo.jsx, CampoObservaciones.jsx, Toast.jsx, ErrorBoundary.jsx
  pages/Cotizador.jsx      -> pantalla principal: form + panel lateral con precio; "Limpiar borrador"
  pages/Comparativa.jsx    -> compara varios modelos lado a lado, borrador auto-guardado; "Limpiar borrador"
  pages/Admin.jsx          -> Catálogo: clases, export Excel, backup, ajuste masivo, tipos, categorías, variables
  pages/Historial.jsx      -> cotizaciones guardadas: búsqueda, filtro por fecha, duplicar, exportar PDF
  App.jsx                  -> shell: header + nav de tabs + toggle de tema claro/oscuro
  index.css                -> design tokens (--paper, --ink, --accent*, --band*, etc.) por tema claro/oscuro
  App.css                  -> todo el CSS de layout/componentes, importado global

src-tauri/
  src/lib.rs               -> entry point Rust: registro de plugins (log, dialog, fs)
  tauri.conf.json          -> config de bundle, versión, ventana, recursos incluidos en el instalador
  capabilities/default.json -> permisos habilitados para el webview (core, dialog, fs)
  Cargo.toml               -> versión + dependencias Rust

tests/                     -> unitarios (clasesProductos, eliminarClase, exportarCatalogoExcel, guardarArchivo, ordenar)
tests/ui/clases.spec.js    -> flujo de clases end-to-end con Playwright
datos-prueba/              -> catálogo "PRUEBA" para probar clases a mano (ver su LEEME.md). No se empaqueta.
```

Otros archivos relevantes en la raíz:
- `PRODUCT.md` — contexto de producto (ver arriba).
- `CHECKLIST_REQUERIMIENTOS.md` — checklist funcional detallado, con líneas de código referenciadas.
- `PLAN_REDISENO_ESCRITORIO.md` — plan de rediseño de escritorio; **ya ejecutado**.
- `datos-demo.json` — catálogo de ejemplo **ficticio**. No usar como evidencia de reglas de negocio reales.
- `BINA MAQUINARIAS LOGO_2026_Mesa de trabajo 1 copia.png` — logo oficial del cliente (header y PDF).
- `.impeccable/critique/` — reportes de auditorías de UX/diseño hechas con el skill `/impeccable` (histórico).

## Modelo de datos (Dexie, `src/db/database.js`)

Tablas: `clasesProductos`, `tiposTrailer`, `categorias`, `variables`,
`cotizaciones`, `config` (clave-valor: redondeo, borradores, clase
seleccionada por pantalla).

Migraciones ya aplicadas (no reordenar ni editar versiones viejas; agregar
la próxima como `db.version(7)`):
- v2: esquema base.
- v3: separa `categorias` en tabla propia.
- v4: `cliente` en cotizaciones pasa de string a objeto `{nombreCliente, razonSocial, cuit}`.
- v5: `categorias` gana el flag `esDescuento`.
- v6: **clases de productos**. Crea `clasesProductos` (Trailers, Cajas, Universal); agrega `claseId` a
  tipos, categorías, variables y cotizaciones (lo existente pasa a Trailers); las variables se vinculan
  por `categoriaId`; el nombre de categoría es único **por clase** (`&[claseId+nombre]`), no global.

**Clases**: un registro pertenece a su clase o a Universal (`perteneceAClase`).
Universal se ve en todas las clases, incluidas las que se creen después. Una
variable Universal exige categoría Universal (`validarClaseCategoria`). Cada
pantalla recuerda su clase (`config` → `claseSeleccionada:<pantalla>`) y los
borradores quedan atados a la clase (`guardarBorrador` no guarda si la
pantalla ya cambió de clase).

**Backup/restore**: formato JSON con todas las tablas. El import **combina,
nunca reemplaza**: separa registros nuevos de duplicados y pregunta antes de
sobrescribir. Es un principio de producto explícito (`PRODUCT.md`), no
cambiarlo sin confirmar con el usuario.

## Motor de cálculo (`src/utils/calcularPrecio.js`)

- `calcularPrecio(tipoTrailer, variables, redondeo)`: precio base + modificadores `fijo` (con `cantidad`) +
  modificadores `porcentual` (sobre `base` o `subtotal`).
- `calcularPrecioConGanancia(...)`: corre `calcularPrecio` para el costo real y otra vez con precios ya
  multiplicados por la `ganancia`, así el % se calcula sobre el precio que ve el cliente.
- `desglosarEstandarYOpcionales(...)`: separa precio estándar de adicionales opcionales (Cotizador y PDFs).

Cualquier vista nueva que muestre precio **debe** pasar por estas funciones.

## Estado actual (2026-10-02)

Último release publicado: **v0.1.9** (GitHub, con `Cotizador.de.Trailers_0.1.9_x64-setup.exe`).

Funcionalidad agregada desde v0.1.7:
- **v0.1.8**: botón "Limpiar borrador" en Cotizador (PR #6); clases de productos con Universal (PR #7);
  exportar catálogo completo a Excel; tests unitarios y de UI.
- **v0.1.9** (commit `554b134`):
  - **"Ordenar por"** en Cotizador, Comparativa y Catálogo: Nombre (A-Z / Z-A) y Precio (menor→mayor /
    mayor→menor). Lógica única en `utils/ordenar.js` + componente `SelectorOrden`. Ordena tipos de producto,
    categorías (solo en Catálogo) y variables. En los selectores de variables y en la lista de variables del
    Catálogo, las categorías siempre van A-Z y el orden se aplica dentro de cada una. Precio = `precioBase`
    (tipos) o `valor` (variables; las porcentuales comparan el número del %). Empates por nombre.
    El orden **no se persiste**: vuelve a A-Z al recargar.
  - **"Limpiar borrador" en Comparativa**: igual que en Cotizador, sin confirmación. Vuelve a dos opciones
    vacías y borra cliente y observaciones.

## Pendientes

1. **Commitear el bump 0.1.9.** `package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`,
   `src-tauri/Cargo.toml` y `src-tauri/Cargo.lock` dicen 0.1.9 en el working tree pero no están commiteados.
   El tag `v0.1.9` apunta a `554b134`, donde esos archivos dicen 0.1.8 (el instalador publicado sí es 0.1.9,
   porque se compiló desde el working tree). Commitear y, si el usuario quiere, mover el tag
   (`git tag -f v0.1.9 && git push -f origin v0.1.9`) — confirmar antes, reescribe un tag publicado.
2. Probar el instalador en una máquina limpia (o reinstalando): que abra y que "Descargar PDF" funcione
   en Cotizador, Historial y Comparativa.
3. "Botón de descarga" que el usuario mencionó hace tiempo: no está en este repo, probablemente en un sitio
   externo. Falta que el usuario diga dónde está.
4. Ideas opcionales, no pedidas: persistir el orden elegido; tope de cantidad 999 en Comparativa
   (`cambiarCantidad` no lo tiene; Cotizador sí).

## Flujo de release

1. Subir la versión en los 5 archivos de arriba (en `Cargo.lock` solo la entrada `name = "app"`).
2. Commit + push.
3. `npm run tauri:build`.
4. `git tag vX.Y.Z && git push origin vX.Y.Z`.
5. `gh release create vX.Y.Z "src-tauri/target/release/bundle/nsis/Cotizador de Trailers_X.Y.Z_x64-setup.exe" --title "Cotizador vX.Y.Z" --generate-notes`
   (se adjunta solo el `-setup.exe`, no el `.msi`).

## Gotchas conocidos

- **WebView2Loader.dll**: `tauri.conf.json` debe conservar `"resources": { "target/release/WebView2Loader.dll": "" }`.
  Sacarlo rompe la app instalada. Si el primer build en una máquina nueva falla porque la dll no existe,
  correr `cargo build --release` en `src-tauri` una vez y repetir.
- **Localhost (navegador) ≠ app instalada (WebView2)**: descargas, clipboard, etc. hay que probarlas en la app
  empaquetada. Por eso los archivos se guardan con el diálogo nativo de Tauri (`plugin-dialog` + `plugin-fs`)
  y no con `<a download>`.
- **`src-tauri/Cargo.lock`** se autorregenera con cualquier build de Rust; en un bump alcanza con editar la
  entrada de la app o correr `cargo check`.
- **`datos-demo.json` y `datos-prueba/`** son ficticios. Una aparente inconsistencia de reglas de negocio ahí
  probablemente sea artefacto de datos falsos: confirmar con el usuario antes de "arreglarla".
- **Tokens de tema** (`src/index.css`): `--accent-soft` + `--accent-ink` se oscurecen juntas en modo oscuro;
  para texto sobre fondos temáticos usar `--ink`.
- **Tests de UI y orden de listas**: las listas ahora se ordenan (A-Z por defecto), así que los tests deben
  ubicar filas por texto (`getByRole('listitem').filter({ hasText })`), no con `.last()`/`.first()`.

## Sesiones anteriores relevantes (para no repetir trabajo)

- `/impeccable init` + `/impeccable critique` sobre Cotizador (reporte en `.impeccable/critique/`). El usuario
  descartó el P1 (frenos contradictorios, artefacto de `datos-demo.json`) y un P2 de jerarquía del panel de
  costo/margen. El resto se implementó (tope 999, tamaño de labels, label del buscador, ErrorBoundary genérico).
- Se ejecutó `PLAN_REDISENO_ESCRITORIO.md` (layout de dos columnas).
- v0.1.7: fixes de release (WebView2Loader.dll y PDF con diálogo nativo).
- 2026-10-02: "Ordenar por" y "Limpiar borrador" en Comparativa; release v0.1.9; actualización de este handoff.

## Preferencias de trabajo del usuario

- Mensajes breves en español; responder en español, concreto y accionable.
- El usuario hace los commits él mismo; pedirle o pasarle los comandos en vez de commitear sin que lo pida.
- Corrige hallazgos basados en datos ficticios: confirmar antes de implementar fixes "de diseño" que dependan
  de datos de ejemplo.
- Ante bugs de build/release: causa raíz, fix mínimo, verificar con build/tests reales antes de darlo por resuelto.
