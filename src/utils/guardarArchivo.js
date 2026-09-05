import { isTauri } from '@tauri-apps/api/core'

export async function guardarArchivo(datos, { nombre, mime, extension, descripcion }) {
  if (isTauri()) {
    const [{ save }, { writeFile }] = await Promise.all([
      import('@tauri-apps/plugin-dialog'), import('@tauri-apps/plugin-fs')
    ])
    const destino = await save({ defaultPath: nombre, filters: [{ name: descripcion, extensions: [extension] }] })
    if (!destino) return false
    await writeFile(destino, datos)
    return true
  }
  const url = URL.createObjectURL(new Blob([datos], { type: mime }))
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombre
  document.body.appendChild(enlace)
  try {
    enlace.click()
  } finally {
    enlace.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return true
}
