const DIMENSION_MAXIMA = 1200
const CALIDAD_JPEG = 0.8

/**
 * Lee un archivo de imagen y lo devuelve como data URL JPEG, redimensionado
 * si excede DIMENSION_MAXIMA en algún lado (para no inflar la base local ni
 * el backup con fotos de cámara de varios MB).
 * @param {File} file
 * @returns {Promise<string>}
 */
export function leerImagenComoDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('No se pudo leer la imagen.'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('No se pudo procesar la imagen.'))
      img.onload = () => {
        let { width, height } = img
        if (width > DIMENSION_MAXIMA || height > DIMENSION_MAXIMA) {
          const factor = DIMENSION_MAXIMA / Math.max(width, height)
          width = Math.round(width * factor)
          height = Math.round(height * factor)
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        canvas.getContext('2d').drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', CALIDAD_JPEG))
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}
