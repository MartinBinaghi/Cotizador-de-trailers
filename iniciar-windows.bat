@echo off
cd /d "%~dp0"
echo Instalando dependencias (solo la primera vez)...
if not exist node_modules (
  call npm install
)
echo Construyendo la app...
call npm run build
echo Iniciando servidor local...
start "" http://localhost:4173
call npm run preview
pause
