import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ordenar } from '../src/utils/ordenar.js'

const items = [
  { nombre: 'Batea', precioBase: 300 },
  { nombre: 'álamo', precioBase: 100 },
  { nombre: 'Carga', precioBase: 100 },
  { nombre: 'Zorra', valor: 50 }
]
const nombres = (criterio) => ordenar(items, criterio).map(i => i.nombre)

test('ordena por nombre respetando acentos y mayúsculas', () => {
  assert.deepEqual(nombres('nombre-asc'), ['álamo', 'Batea', 'Carga', 'Zorra'])
  assert.deepEqual(nombres('nombre-desc'), ['Zorra', 'Carga', 'Batea', 'álamo'])
  assert.deepEqual(nombres(undefined), nombres('nombre-asc'))
})

test('ordena por precio (precioBase o valor) y desempata por nombre', () => {
  assert.deepEqual(nombres('precio-asc'), ['Zorra', 'álamo', 'Carga', 'Batea'])
  assert.deepEqual(nombres('precio-desc'), ['Batea', 'álamo', 'Carga', 'Zorra'])
})

test('no muta el arreglo original', () => {
  const copia = [...items]
  ordenar(items, 'precio-desc')
  assert.deepEqual(items, copia)
})
