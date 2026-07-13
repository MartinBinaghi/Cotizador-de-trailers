# Checklist — Nuevos requerimientos (2026-07-12)

**ESTADO: los 4 requerimientos + la ronda de correcciones del 2026-07-12
(tarde) están implementados (build OK con `npm run build`). Falta probar
manualmente en el navegador — no hay herramienta de browser automation
disponible en esta sesión, así que no se validó visualmente el flujo
completo (ver "Pendiente de verificación manual" al final).**

## Ronda de correcciones (2026-07-12, después de la primera implementación)

- [x] PDF individual: se quitaron "Adicionales fijos"/"Adicionales
      porcentuales" y "Precio base" de la caja resumen.
- [x] PDF individual: "Variables aplicadas" se dividió en dos secciones:
      "Configuración estándar" (solo variables NO opcionales aplicadas, sin
      precio) y "Añadidos opcionales" (solo variables opcionales, con
      precio). Helper nuevo `dibujarSeccionVariables()` en `generarPdf.js`.
- [x] PDF individual: caja resumen ahora muestra "Precio estándar" (base +
      no opcionales) y "Adicionales opcionales" (suma de opcionales), y
      luego TOTAL + IVA igual que antes.
- [x] PDF comparativo: fila "Precio base" renombrada a "Precio estándar" =
      base + suma de variables no opcionales de esa columna (`Comparativa.jsx`
      calcula `precioEstandar` por columna usando `resultado.detalle`).
- [x] Previsualización en pantalla (NO el PDF) de Cotizador.jsx y
      Comparativa.jsx: se quitaron las líneas/filas "Adicionales fijos" y
      "Adicionales porcentuales". Se dejó "Base"/"Precio base" y "Total"
      sin renombrar ahí (el pedido de renombrar a "Precio estándar" fue
      solo para los PDFs, no para la previsualización).

Stack: React 18 + Vite, JS puro (sin TS), Dexie (IndexedDB), jsPDF.
Sin git en el repo — cuidado al perder cambios, no hay historial para revertir.

Decisiones ya acordadas con el usuario (no volver a preguntar):

- **Merge de backup**: detectar duplicados por campo `nombre` (case/espacios
  insensitive). Para `tiposTrailer`, `categorias` y `variables` (variables
  además por `categoria`). Si hay duplicados, mostrar un diálogo de
  confirmación único: "Se encontraron N elementos ya existentes. ¿Desea
  sobrescribirlos con los datos del backup?" → Sí = overwrite, No = se
  mantiene el local y se ignora ese ítem del backup. Los ítems del backup que
  NO son duplicados se agregan siempre.
- **cotizaciones**: se tratan como catálogo también: duplicado si coincide
  (cliente + fecha + precioFinal/total). Mismo diálogo de sobrescribir sí/no.
- **config**: se ignora la del backup, se mantiene siempre la local (config es
  por-instalación, no tiene sentido combinarla).
- **Variables — nuevo campo `esOpcional`** (booleano, mismo patrón de
  naming/UI que `permiteCantidad`). Default para variables ya existentes en
  la base: `false` (obligatoria/estándar).
- **PDF individual**: variables NO opcionales → mostrar solo si el trailer
  la tiene o no (sin precio). Variables opcionales → mostrar con precio
  (para que se vea la diferencia vs. estándar). Resto del formato del PDF
  individual queda igual (encabezado, caja resumen con base/fijos/
  porcentuales/total, etc. no se tocan).
- **PDF comparativo**: eliminar filas "Adicionales fijos" y "Adicionales
  porcentuales". Variables no opcionales siguen mostrándose como Sí/No (sin
  precio, como ya es hoy). Variables opcionales pasan a mostrar su precio
  por columna/trailer. Agregar una fila nueva tipo "Total opcionales" (o
  similar) por columna, mostrando cuánto suman los opcionales elegidos —
  esa es "la diferencia" pedida entre el estándar y lo que pidió el cliente.

---

## 1) Backup: combinar en lugar de reemplazar

- [ ] `src/db/database.js`: reescribir `importarBackup(data)` (líneas ~74-97).
      Ya NO hacer `clear()` de las tablas. Por cada tabla (`tiposTrailer`,
      `categorias`, `variables`, `cotizaciones`):
  - [ ] Cargar los registros locales actuales.
  - [ ] Para cada registro del backup, calcular su clave de comparación
        (`nombre` normalizado, o `cliente+fecha+total` para cotizaciones) y
        buscar si ya existe localmente.
  - [ ] Separar en dos listas: `nuevos` (se agregan siempre con `bulkAdd`,
        dejando que Dexie asigne el `++id` local — importante: NO reusar el
        `id` que traía el backup, para no chocar con autoincrement local) y
        `duplicados` (existen local y en backup).
  - [ ] Si `duplicados.length > 0`, devolver/exponer esa info para que la UI
        pregunte antes de aplicar el overwrite (no hacer `confirm()` dentro
        de `database.js`, mantener esa capa sin lógica de UI — pasar la
        decisión como parámetro o dividir en 2 pasos: "detectar" y "aplicar").
  - [ ] `config`: no tocar la tabla local en absoluto durante el import.
  - [ ] Verificar que las relaciones por id (ej. `variables.categoria`,
        `cotizaciones.tipoTrailerId`) sigan siendo válidas tras el remapeo de
        ids nuevos — si el backup referencia ids que van a cambiar, hay que
        re-mapear las referencias (ej. id viejo de categoría → id nuevo
        asignado) antes de insertar variables/cotizaciones que dependen de
        ellas.
- [ ] `src/pages/Admin.jsx`, componente `BackupRestore` (líneas ~444-504):
  - [ ] Cambiar el texto de confirmación inicial (ya no "reemplaza TODOS los
        datos", sino algo como "Se combinarán los datos del backup con los
        actuales").
  - [ ] Agregar el segundo diálogo (solo si hay duplicados) para
        overwrite sí/no, según lo detectado por `database.js`.
  - [ ] Mostrar resumen post-import (ej. "Se agregaron N elementos nuevos, se
        sobrescribieron M, se mantuvieron K").
- [ ] Probar caso del ejemplo del usuario: máquina 1 con (a,b,c), máquina 2
      con (d,e,f) → tras importar backup de 1 en 2, deben quedar (a,b,c,d,e,f)
      sin pérdida de ningún elemento.
- [ ] Probar caso con duplicados: mismo `nombre` en ambas máquinas con datos
      distintos, confirmar que responde a la elección del diálogo (overwrite
      vs. mantener local).

## 2) Cotización: cliente → nombre / razón social / CUIT (todos opcionales)

- [ ] `src/pages/Cotizador.jsx`:
  - [ ] Reemplazar el único input de "Cliente" (línea ~104) por 3 campos:
        nombre del cliente, razón social, CUIT — todos opcionales, sin
        validación obligatoria.
  - [ ] Reemplazar `const [cliente, setCliente] = useState('')` (línea ~24)
        por 3 estados (o un objeto `{nombreCliente, razonSocial, cuit}`).
  - [ ] Actualizar `guardarCotizacion` (líneas ~69-82): en vez de guardar
        `cliente: cliente || 'Sin nombre'` (línea 78), guardar el objeto con
        los 3 campos (decidir default cuando los 3 están vacíos, ej. mantener
        "Sin nombre" en el campo nombre).
  - [ ] Revisar el JSDoc de "duplicar cotización" (líneas ~12-13) y su lógica
        de precarga de campos.
- [ ] `src/db/database.js`: el índice Dexie `cotizaciones: '++id,
      tipoTrailerId, fecha, precioFinal, cliente'` (líneas 16-17 v2, línea 27
      v3) — evaluar si conviene indexar por `cliente.nombreCliente` o
      dejar de indexar por cliente y filtrar en memoria. Si cambia la forma
      del campo `cliente` (string → objeto), probablemente haga falta
      **nueva versión de esquema Dexie** con migración para las cotizaciones
      viejas (string plano → `{nombreCliente: string, razonSocial: '', cuit:
      ''}`).
- [ ] `src/pages/Historial.jsx`:
  - [ ] Búsqueda por texto (línea ~29) que hoy usa `c.cliente` como string
        directo — adaptar para buscar dentro de los 3 subcampos.
  - [ ] Visualización (línea ~99) — mostrar los 3 datos (o al menos el
        nombre, con razón social/CUIT en detalle/tooltip).
- [ ] `src/utils/generarPdf.js`, `generarPdfCotizacion` (recibe `cliente`
      como string en líneas 66, 83) — adaptar el bloque de datos de
      cliente/tipo trailer (líneas ~74-84) para mostrar nombre, razón social
      y CUIT (solo los que tengan valor, ya que son opcionales).
- [ ] Confirmar con el usuario cómo mostrar los campos vacíos en el PDF (¿se
      omite la línea entera si no hay dato, o se muestra en blanco?). →
      **Asumido por defecto: omitir la línea si el campo está vacío.**
      Marcar como pendiente de confirmar si el usuario lo objeta.

## 3) Variables: nueva celda "es opcional"

- [ ] `src/db/database.js`: agregar comentario/documentación del nuevo campo
      `esOpcional` junto al de `permiteCantidad` (líneas ~10-12). No hace
      falta agregarlo al string de índices Dexie (igual que `permiteCantidad`
      no está indexado), pero si se agrega una nueva versión de esquema por
      el punto 2, aprovechar para documentarlo ahí.
- [ ] `src/pages/Admin.jsx`, componente `AdminVariables` (líneas 190-442):
  - [ ] Nuevo estado `const [esOpcional, setEsOpcional] = useState(false)`
        junto a `permiteCantidad` (línea ~200).
  - [ ] Checkbox "Es opcional" al crear variable, junto al checkbox "Permite
        cargar cantidad" (líneas ~429-436).
  - [ ] Persistir en `agregar()` (líneas ~263-270): `await db.variables.add({
        ..., esOpcional})`.
  - [ ] Checkbox al editar (líneas ~346-353) y persistir en
        `guardarEdicion()` (líneas ~299-306): `esOpcional: !!editVar.esOpcional`.
  - [ ] Etiqueta en el listado (junto a la de "(admite cantidad)", línea
        ~361): ej. `(opcional)` / `(incluida de fábrica)` — a definir texto.
  - [ ] Migración: variables ya guardadas sin el campo deben tratarse como
        `esOpcional: false` (usar `!!v.esOpcional` en todas las lecturas, no
        asumir que el campo existe).
- [ ] `src/components/SelectorVariables.jsx`: revisar si hace falta algún
      cambio visual para distinguir opcionales de obligatorias en el selector
      del cotizador (el requerimiento no lo pide explícitamente — **solo
      pide la celda/columna en la administración de variables** — confirmar
      si además se quiere alguna distinción visual acá o no).
- [ ] `src/utils/validaciones.js`, `validarVariable` (líneas ~19-34): no
      parece necesitar cambios, pero revisar si debería validar algo
      relacionado a `esOpcional`.

## 4) PDFs: ocultar precio de componentes no opcionales

### PDF individual — `src/utils/generarPdf.js`, `generarPdfCotizacion` (líneas 64-171)

- [ ] En el loop de "Variables aplicadas" (líneas ~91-124):
  - [ ] Si `v.esOpcional === true` → mostrar nombre + monto (comportamiento
        actual, usando `montoVariable(v, resultado)`, líneas 51-56).
  - [ ] Si `v.esOpcional !== true` (obligatoria/estándar) → mostrar solo
        nombre / indicación de que el trailer la incluye, **sin** el monto.
  - [ ] No tocar el resto: encabezado (`dibujarEncabezado`, líneas 19-32),
        datos de cliente/tipo trailer (ahora con los cambios del punto 2),
        ni la caja resumen final (Precio base / Adicionales fijos /
        Adicionales porcentuales / TOTAL, líneas 126-165) — el requerimiento
        dice explícitamente que el resto del formato se mantiene.
- [ ] Verificar visualmente que con esto ya se puede inferir la diferencia
      estándar vs. con opcionales (suma de los montos opcionales visibles).

### PDF comparativo — `src/utils/generarPdf.js`, `generarPdfComparativa` (líneas 177-265)

- [ ] Quitar del array `filas` (líneas ~191-198) las entradas "Adicionales
      fijos" y "Adicionales porcentuales".
- [ ] Cambiar cómo se arman los valores de variables por columna: hoy
      `Comparativa.jsx` (líneas ~92-121, en particular 98-105) arma
      `valoresVariables[v.nombre]` como texto `'Sí'` / `'Sí (x2)'` / `'—'`
      para TODAS las variables. Adaptar para:
  - [ ] Variables no opcionales → seguir mostrando Sí/No (sin precio, como
        hoy).
  - [ ] Variables opcionales → mostrar el precio (monto) en vez de Sí/No,
        cuando el trailer la tiene; `—` si no la tiene. Para esto hay que
        calcular el monto por variable y por columna (hoy `calcularPrecio`
        solo devuelve `detalle` con montos de porcentuales — puede hacer
        falta extender `calcularPrecio.js`, líneas 18-49, para exponer
        también el monto de las fijas por variable, reusando la lógica de
        `montoVariable()` que hoy solo vive en `generarPdf.js`).
  - [ ] Agregar una fila nueva "Total opcionales" (o el nombre que el
        usuario prefiera) por columna = suma de los montos de las variables
        opcionales que tiene ese trailer. Esta es la "diferencia" que pide
        el punto 4 entre el estándar y lo pedido por el cliente.
- [ ] `src/pages/Comparativa.jsx`, `descargarComparativaPdf()` (líneas
      92-121): actualizar para pasar los montos por variable opcional y el
      total de opcionales por columna a `generarPdfComparativa`.
- [ ] Confirmar con el usuario el texto exacto de la nueva fila/etiqueta de
      "diferencia por opcionales" en el comparativo.

---

## Orden sugerido de implementación

1. Punto 3 (campo `esOpcional` en variables) — es prerequisito de datos para
   el punto 4.
2. Punto 4 (PDFs) — depende de 3.
3. Punto 2 (cliente estructurado) — independiente, pero toca el mismo
   `generarPdf.js` que el punto 4, conviene no pisarse.
4. Punto 1 (backup merge) — independiente del resto, se puede hacer en
   paralelo o al final.

## Preguntas abiertas para el usuario (revisar antes/durante implementación)

- [ ] Texto exacto de la etiqueta "(opcional)" en el listado de variables de
      Admin.
- [ ] Texto exacto de la fila nueva de "diferencia por opcionales" en el PDF
      comparativo.
- [ ] Confirmar si en el PDF individual también se quiere una línea explícita
      de "Total opcionales: $X" en la caja resumen, o si alcanza con que se
      infiera sumando los montos opcionales listados (el requerimiento dice
      "el resto del formato del pdf se debe mantener como esta", así que por
      defecto NO se agrega nada a la caja resumen — confirmar).
- [ ] Confirmar si en el selector de variables del cotizador (no solo en
      Admin) se quiere alguna distinción visual entre opcionales y
      obligatorias.
- [ ] Confirmar comportamiento de campos vacíos de cliente (nombre/razón
      social/CUIT) en el PDF: ¿se omite la línea o se muestra en blanco?
      (asumido: se omite).

---

## Resumen de implementación (2026-07-12)

Los 4 requerimientos se implementaron en el código. `npm run build` corre
sin errores. Decisiones tomadas para las preguntas abiertas de arriba (se
puede ajustar si no es lo que se quería):

- Etiqueta en Admin: `(opcional)` junto al nombre de la variable, mismo
  estilo que `(admite cantidad)`.
- Fila nueva en el comparativo: **"Total opcionales"**.
- PDF individual: la caja resumen (Precio base / Adicionales fijos /
  Adicionales porcentuales / TOTAL) **no se tocó**, tal cual pedía el
  requerimiento. La diferencia estándar-vs-opcionales se ve sumando los
  montos de las variables opcionales listadas arriba.
- Selector de variables del cotizador (`SelectorVariables.jsx`): **no se
  modificó**, el requerimiento 3 solo pedía la celda en la administración.
- Campos de cliente vacíos en el PDF: se omite la línea (Razón social/CUIT
  solo aparecen si tienen valor).

### Archivos modificados

- `src/db/database.js`: nuevo campo `esOpcional` documentado; esquema v4
  (cliente string → objeto, con migración); `analizarBackup()` +
  `combinarBackup()` reemplazan a `importarBackup()` (merge en vez de
  reemplazo, con remapeo de ids de tipoTrailer y variables para no romper
  referencias).
- `src/pages/Admin.jsx`: checkbox "Es opcional" en variables (crear/editar/
  listado); flujo de `BackupRestore` actualizado a 2 confirmaciones
  (combinar → sobrescribir duplicados sí/no) + resumen final.
- `src/App.css`: estilo `.etiqueta-opcional`.
- `src/utils/calcularPrecio.js`: `detalle` ahora incluye variables fijas y
  porcentuales (antes solo porcentuales), con `id` y `esOpcional`.
- `src/utils/generarPdf.js`: PDF individual oculta precio de variables no
  opcionales (muestra "Incluido"); PDF comparativo sin filas de adicionales
  fijos/porcentuales, con precio de opcionales y fila "Total opcionales";
  bloque de cliente ahora muestra nombre/razón social/CUIT.
- `src/pages/Cotizador.jsx`: 3 inputs de cliente (nombre/razón social/CUIT),
  todos opcionales.
- `src/pages/Historial.jsx`: búsqueda y visualización adaptadas al cliente
  estructurado.
- `src/pages/Comparativa.jsx`: `descargarComparativaPdf()` arma
  `variablesInfo` + `totalOpcionales` por columna.

### Pendiente de verificación manual

No hay herramienta de navegador en esta sesión para probar visualmente. Antes
de dar esto por cerrado, correr `npm run dev` y probar a mano:

- [ ] Crear una variable opcional y una no opcional, generar un PDF
      individual y confirmar que la no opcional dice "Incluido" sin precio,
      y la opcional muestra el monto.
- [ ] Generar un PDF comparativo con al menos una variable opcional
      seleccionada en un modelo y no en otro, y confirmar que aparecen los
      precios y la fila "Total opcionales", y que NO aparecen "Adicionales
      fijos"/"Adicionales porcentuales".
- [ ] Cargar una cotización con nombre/razón social/CUIT y verificar que se
      guarda, se busca en Historial, y se refleja en el PDF individual.
- [ ] Backup: exportar desde una "máquina A" (o perfil de navegador),
      importar en otra con datos propios distintos, y confirmar que quedan
      ambos conjuntos combinados sin pérdidas (y que el diálogo de
      duplicados aparece si corresponde).
- [ ] Abrir la app con datos ya existentes (pre-cambio) y confirmar que la
      migración de Dexie (v4) no rompe cotizaciones viejas guardadas con
      `cliente` como string.
