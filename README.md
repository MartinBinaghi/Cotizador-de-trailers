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

- **tiposTrailer**: `{ nombre, precioBase }`
- **variables**: `{ categoria, nombre, tipoModificador: 'fijo'|'porcentual', valor, aplicaSobre: 'base'|'subtotal' }`
- **cotizaciones**: `{ tipoTrailerId, variablesSeleccionadas, precioFinal, cliente, fecha }`

## Funcionalidades

- Cotizador con cálculo en tiempo real y redondeo configurable.
- Catálogo editable (alta, edición y baja) de tipos de trailer y variables,
  con validación de campos.
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
