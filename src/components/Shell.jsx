import { createContext, useContext } from 'react'
import { createPortal } from 'react-dom'

/** Zonas fijas de la ventana (barra lateral, barra de estado) donde las pantallas pueden dibujar. */
export const ShellContext = createContext({})

export function EnShell({ zona, children }) {
  const destino = useContext(ShellContext)[zona]
  return destino ? createPortal(children, destino) : null
}
