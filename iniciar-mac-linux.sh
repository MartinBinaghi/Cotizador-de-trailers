#!/bin/bash
cd "$(dirname "$0")"

if [ ! -d "node_modules" ]; then
  echo "Instalando dependencias (solo la primera vez)..."
  npm install
fi

echo "Construyendo la app..."
npm run build

echo "Iniciando servidor local..."
( sleep 2 && open http://localhost:4173 2>/dev/null || xdg-open http://localhost:4173 2>/dev/null ) &
npm run preview
