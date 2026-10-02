# Prueba manual de clases de productos

Importar **clases-productos.json** desde **Catálogo → Backup y restauración →
Actualizar con backup**. Todos los nombres de ejemplo empiezan con `PRUEBA`.
Los precios y clientes son ficticios; no representan reglas comerciales reales.

Para mantener estas pruebas separadas de la app instalada, abrir el proyecto
con `npm run dev` en el navegador e importar allí. La importación combina datos:
no borra el catálogo que ya exista. El archivo no cambia el redondeo ni la
selección de clase de tus pantallas.

## Qué incluye

- 6 tipos: dos Trailers, dos Cajas, una plataforma Universal y una carrocería.
- 10 categorías y 20 variables: importes fijos, porcentajes, cantidades,
  opcionales, descuentos y servicios compartidos.
- La clase adicional **PRUEBA Carrocerías**, para comprobar que el backup crea
  clases y vincula sus registros correctamente.
- 3 cotizaciones guardadas, con desglose histórico, para probar duplicación y PDF.

## Recorrido sugerido

1. **Filtrado.** En Trailers deben aparecer los dos trailers y la plataforma
   Universal. En Cajas, las dos cajas y la misma plataforma. La carrocería solo
   aparece en PRUEBA Carrocerías. Se suman los datos previos que ya tengas.
2. **Nombres repetidos.** PRUEBA Accesorios existe en Trailers y Cajas. Su variable
   PRUEBA Luz LED cuesta $10.000 en Trailers y $25.000 en Cajas. Cambiar o renombrar
   una categoría no debe modificar la de la otra clase.
3. **Universal.** PRUEBA Pintura negra aparece en todas las clases. Dentro de
   PRUEBA Servicios, “Montaje exclusivo cajas” solo aparece en Cajas y “Montaje
   exclusivo trailers” solo en Trailers, aunque la categoría sea Universal.
4. **Borrador.** Completar cliente, producto, variables y observaciones. Cambiar
   de clase y cancelar: se conserva todo. Repetir y confirmar: se vacía. Recargar
   la pantalla: el borrador anterior no debe reaparecer.
5. **Pantallas independientes.** Dejar Cotizador en Cajas, Catálogo en Trailers
   y Comparativa en PRUEBA Carrocerías. Cambiar de pestaña y verificar que cada
   una recuerda su clase. En Comparativa, elegir dos modelos de la misma clase.
6. **Altas.** En Catálogo/Cajas, crear un tipo, categoría y variable: sus clases
   iniciales deben ser Cajas. Cambiar explícitamente alguna a Universal.
7. **Restricción de categorías.** Editar una Luz LED y ponerla en Universal:
   obliga a elegir una categoría Universal. No permite convertir PRUEBA Pintura
   en exclusiva de Cajas mientras contenga variables Universal.
8. **Nueva clase.** Crear “PRUEBA Módulos” desde Clases de productos, seleccionarla
   y agregar un tipo y una categoría. Allí también se ve lo Universal.
9. **Historial y PDF.** Buscar los clientes PRUEBA, descargar los PDF y duplicar
   las cotizaciones. La duplicación abre la clase correspondiente.
10. **Backup.** Exportar y volver a importar. Debe reconocer los duplicados y
    permitir mantener los datos locales. Para repetir con los valores originales
    de este archivo, importar y aceptar sobrescribir los duplicados PRUEBA.

## Totales de referencia

Para reproducirlos en el Cotizador, usar **Sin redondeo** y seleccionar solamente
las variables indicadas. Todas las ganancias de estos tres tipos son 1.

| Producto | Selección | Total |
|---|---|---:|
| PRUEBA Trailer liviano | Luz LED ×2, Freno por rueda ×2, Pintura negra, Pago de contado | $1.111.500 |
| PRUEBA Caja estándar | Luz LED ×2, Piso reforzado, Pintura negra, Pago de contado | $2.185.000 |
| PRUEBA Carrocería de reparto | Estante interior ×3, Aislación interior, Pintura negra | $3.420.000 |

Estos son también los totales de las tres cotizaciones incluidas en el Historial.

## Instalador y persistencia local

Esta carpeta está fuera de `src` y `public`. Ningún archivo de la app la importa.
Tauri empaqueta `dist` y la DLL declarada en su configuración, no esta carpeta ni
la base IndexedDB del equipo que compila. Los ejemplos automáticos existentes
están condicionados a `import.meta.env.DEV`, desactivado en producción.

Por eso, generar el instalador no incorpora estos datos de prueba. Una
instalación nueva en otro equipo empieza sin productos ni cotizaciones.

Si importás el archivo en una app instalada, esos datos sí quedan en la base
local de esa instalación: reinstalar o actualizar sobre ella conserva los
datos. No significa que estén dentro del instalador.

`generar.mjs` permite regenerar el JSON mediante `node datos-prueba/generar.mjs`.
No se ejecuta durante el build y solo escribe el archivo JSON, sin abrir la base.
