# Cotizador de Trailers

App local (PWA) para cotizar trailers según tipo y variables configurables
(frenos, homologación, ejes, etc.). Todos los datos se guardan en el propio
dispositivo (IndexedDB) — no requiere internet ni servidor en la nube.

## Desarrollo

```bash
npm install
npm run dev
```

## Uso para el cliente final (sin tocar código)

1. Doble click en `iniciar-windows.bat` (Windows) o `iniciar-mac-linux.sh` (Mac/Linux).
2. Se abre el navegador en `http://localhost:4173`.
3. En el navegador, instalarla como app: ícono de instalar en la barra de
   direcciones (Chrome/Edge) → "Instalar Cotizador de Trailers". Queda como
   un ícono más, funciona offline y sin la barra del navegador.
4. Para volver a abrirla más adelante, hay que volver a ejecutar el script
   de inicio (deja el servidor local corriendo) y después abrir el ícono
   instalado.

> Tip: se puede configurar el script para que arranque solo al iniciar
> sesión en Windows (Programador de tareas) o como LaunchAgent en Mac,
> así el cliente ni piensa en esto.

## Estructura

```
src/
  db/database.js         -> definición de la base local (Dexie/IndexedDB)
  utils/calcularPrecio.js -> motor de cálculo del precio final
  pages/Cotizador.jsx     -> pantalla principal de cotización
  pages/Admin.jsx         -> alta/baja de tipos de trailer y variables
  pages/Historial.jsx     -> cotizaciones guardadas
  App.jsx                 -> navegación entre pantallas
```

## Modelo de datos

- **clasesProductos**: `{ id, nombre }`; incluye Trailers, Cajas y Universal.
- **tiposTrailer**: `{ nombre, precioBase, claseId }` (el nombre interno de la tabla se conserva por compatibilidad).
- **categorias**: `{ nombre, claseId, esDescuento }`; admite nombres repetidos entre clases.
- **variables**: `{ categoriaId, categoria, claseId, nombre, tipoModificador: 'fijo'|'porcentual', valor, aplicaSobre: 'base'|'subtotal' }`
- **cotizaciones**: `{ tipoTrailerId, variablesSeleccionadas, precioFinal, cliente, fecha }`

## Clases de productos

Cada pantalla (Cotizador, Catálogo y Comparativa) recuerda su propia clase.
Muestra los registros de esa clase más los Universal. Al cambiar de clase se
pide confirmación y se vacía el borrador de esa pantalla; cancelar lo conserva.
En Catálogo se descartan únicamente los cambios de formularios sin guardar.

En **Catálogo → Clases de productos** se crean clases nuevas. Tipos, categorías
y variables toman inicialmente la clase seleccionada y permiten cambiarla al
crear o editar. Universal habilita el registro para todas las clases, incluidas
las futuras. Una variable necesita una categoría de su misma clase o Universal;
una variable Universal necesita una categoría Universal. Para volver exclusiva
una categoría compartida, primero hay que mover o reclasificar las variables
que quedarían incompatibles.

En esa misma sección se puede eliminar cualquier clase excepto Universal.
La confirmación muestra cuántos tipos, categorías y variables se borrarán.
También se descartan los borradores de esa clase y sus pantallas pasan a Universal.
Se conservan el historial (con su desglose para PDF), las otras clases y los
registros Universal. La eliminación del catálogo se realiza en una sola transacción.

La migración de base v6 asigna los datos anteriores a Trailers y conserva ids,
precios, historial y borradores. Las variables se vinculan por `categoriaId`
para distinguir categorías homónimas. No modificar migraciones anteriores.
Los backups v2 incluyen clases; los backups antiguos se importan en Trailers.
La restauración sigue combinando datos y pidiendo confirmación para sobrescribir
duplicados; conserva la configuración local.

## Pruebas

```bash
npm test
npm run test:ui
npm run build
```

Las pruebas de datos usan IndexedDB en memoria. Las pruebas de interfaz usan
Microsoft Edge en modo headless y un servidor de prueba en el puerto 5187,
con datos ficticios aislados del perfil habitual del usuario.

## Funcionalidades

- Cotizador con cálculo en tiempo real y redondeo configurable.
- Catálogo editable (alta, edición y baja) de tipos de trailer y variables,
  con validación de campos.
- Exportación del catálogo completo a Excel (`.xlsx`): cuatro hojas con clases,
  tipos, categorías y variables de todas las clases, con precios y configuración.
  Disponible en Catálogo → Exportar catálogo a Excel; funciona offline y usa
  Guardar como en la app de escritorio.
- Historial de cotizaciones con buscador por cliente y filtro por rango de
  fechas, botón para duplicar una cotización anterior y exportar a PDF.
- Exportar cotización individual a PDF (jsPDF, carga diferida para no
  inflar el bundle inicial).
- Backup y restauración completa de la base en un archivo JSON
  (Admin → "Backup y restauración").
- Notificaciones tipo toast en vez de `alert()`.

## Pendiente / próximos pasos sugeridos

- [ ] Confirmar con el cliente la regla exacta de cálculo (¿los % siempre
      van sobre el subtotal, o depende de la variable?) — ya está
      modelado como configurable por variable (`aplicaSobre`).
- [ ] Reemplazar los íconos placeholder (`public/icon-192.png`,
      `icon-512.png`) por el logo real del cliente.
- [ ] Considerar recordatorio periódico (ej. al abrir la app cada N días)
      para que el cliente descargue un backup.
