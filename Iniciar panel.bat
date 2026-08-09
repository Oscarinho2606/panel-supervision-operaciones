@echo off
chcp 65001 >nul
title Panel de Supervision de Operaciones
cd /d "%~dp0"

echo.
echo   Iniciando el Panel de Supervision de Operaciones...
echo.

rem El servicio de PostgreSQL debe estar corriendo
sc query postgresql-x64-18 | find "RUNNING" >nul
if errorlevel 1 (
  echo   PostgreSQL no esta iniciado. Intentando arrancarlo...
  net start postgresql-x64-18 >nul 2>&1
  if errorlevel 1 (
    echo.
    echo   No se pudo iniciar PostgreSQL. Abre "Servicios" de Windows
    echo   y arranca "postgresql-x64-18" manualmente.
    echo.
    pause
    exit /b 1
  )
)

node servidor\server.js

echo.
echo   El servidor se detuvo.
pause
