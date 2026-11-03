import { test, expect } from '@playwright/test'

// Regresión: inputs ocultos (.campo-oculto) al final de una pantalla larga estiraban
// la ventana entera; aparecía un segundo scroll y al bajar quedaba todo en blanco.
test('con un catálogo grande solo se desplaza el contenido, nunca la ventana', async ({ page }) => {
  test.setTimeout(60_000)
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Nueva cotización' })).toBeVisible()
  await page.evaluate(async () => {
    const { db } = await import('/src/db/database.js')
    const categorias = Array.from({ length: 19 }, (_, i) => ({ id: 500 + i, nombre: `Categoría ${i}`, claseId: 'trailers', esDescuento: false }))
    await db.categorias.bulkAdd(categorias)
    await db.tiposTrailer.bulkAdd(Array.from({ length: 47 }, (_, i) => ({ nombre: `Tipo ${i}`, claseId: 'trailers', precioBase: 1000 + i })))
    await db.variables.bulkAdd(Array.from({ length: 104 }, (_, i) => ({ nombre: `Variable ${i}`, categoria: `Categoría ${i % 19}`,
      categoriaId: 500 + (i % 19), claseId: 'trailers', valor: i, tipoModificador: 'fijo', aplicaSobre: 'base' })))
    await db.cotizaciones.bulkAdd(Array.from({ length: 40 }, (_, i) => ({ claseId: 'trailers', tipoTrailerId: null,
      fecha: new Date(2026, 0, i + 1).toISOString(), precioFinal: i, cliente: { nombreCliente: `Cliente ${i}` }, variablesSeleccionadas: [] })))
  })

  async function sinScrollDeVentana(pantalla) {
    await expect(page.locator('.app-contenido')).toBeVisible()
    await page.locator('.app-contenido').evaluate(el => el.scrollTo(0, el.scrollHeight))
    const medida = await page.evaluate(() => ({ documento: document.documentElement.scrollHeight, ventana: innerHeight }))
    expect(medida.documento, pantalla).toBeLessThanOrEqual(medida.ventana)
  }

  await expect(page.getByRole('checkbox', { name: /Variable 103/ })).toBeAttached()
  await sinScrollDeVentana('Cotizador')
  for (const seccion of ['Comparativa', 'Historial', 'Catálogo']) {
    await page.getByRole('button', { name: seccion, exact: true }).click()
    await sinScrollDeVentana(seccion)
  }
  for (const pestana of ['Tipos de producto', 'Categorías', 'Variables', 'Clases', 'Ajuste masivo']) {
    await page.getByRole('navigation', { name: 'Secciones del catálogo' }).getByRole('button').filter({ hasText: pestana }).click()
    await sinScrollDeVentana(`Catálogo / ${pestana}`)
  }
})
