import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { guardarArchivo } from '../src/utils/guardarArchivo.js'

afterEach(() => { delete globalThis.isTauri; delete globalThis.window })
const opciones = { nombre: 'catalogo.xlsx', extension: 'xlsx', descripcion: 'Libro de Excel', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }

test('en Tauri guarda los bytes en la ruta elegida por el usuario', async () => {
  globalThis.isTauri = true
  const llamadas = []
  globalThis.window = { __TAURI_INTERNALS__: { invoke: async (...args) => {
    llamadas.push(args)
    if (args[0] === 'plugin:dialog|save') return 'C:\\Pruebas\\catálogo.xlsx'
  } } }
  const bytes = new Uint8Array([80, 75, 3, 4])
  assert.equal(await guardarArchivo(bytes, opciones), true)
  assert.equal(llamadas[0][1].options.filters[0].extensions[0], 'xlsx')
  assert.equal(llamadas[1][0], 'plugin:fs|write_file')
  assert.deepEqual(llamadas[1][1], bytes)
  assert.equal(decodeURIComponent(llamadas[1][2].headers.path), 'C:\\Pruebas\\catálogo.xlsx')
})

test('cancelar el diálogo nativo no escribe un archivo ni indica éxito', async () => {
  globalThis.isTauri = true
  let cantidad = 0
  globalThis.window = { __TAURI_INTERNALS__: { invoke: async command => {
    assert.equal(command, 'plugin:dialog|save')
    cantidad++
    return null
  } } }
  assert.equal(await guardarArchivo(new Uint8Array(), opciones), false)
  assert.equal(cantidad, 1)
})

test('propaga un error de escritura para mostrarlo en la interfaz', async () => {
  globalThis.isTauri = true
  globalThis.window = { __TAURI_INTERNALS__: { invoke: async command => {
    if (command === 'plugin:dialog|save') return 'C:\\Pruebas\\catalogo.xlsx'
    throw new Error('Sin permiso de escritura')
  } } }
  await assert.rejects(guardarArchivo(new Uint8Array(), opciones), /Sin permiso/)
})
