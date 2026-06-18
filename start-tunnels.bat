@echo off
setlocal

set "ROOT=%~dp0"
cd /d "%ROOT%"

echo === Start All Tunnels ===
echo.

node --version >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js is not installed.
  echo Please install Node.js from https://nodejs.org
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing dependencies...
  npm install
  if errorlevel 1 (
    echo ERROR: npm install failed.
    pause
    exit /b 1
  )
)

echo Starting all tunnels (mode: auto-detect)...
npm run start

if errorlevel 1 (
  echo.
  echo Tunnels start failed or partially failed.
)
echo.
pause
