@echo off
cd /d "%~dp0"

if not exist "node_modules" (
  echo Instalando dependencias...
  call npm install
)

call npm run build
if errorlevel 1 (
  pause
  exit /b 1
)

call npm start
