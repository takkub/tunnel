@echo off
setlocal

:: Find project root (directory containing this script)
set "ROOT=%~dp0"
cd /d "%ROOT%"

echo === Cloudflare Tunnel Manager ===
echo.

:: Check Node.js
node --version >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js is not installed.
  echo Please install Node.js from https://nodejs.org
  echo.
  pause
  exit /b 1
)

:: Install root deps if node_modules missing
if not exist "node_modules" (
  echo Installing root dependencies...
  npm install
  if errorlevel 1 (
    echo ERROR: npm install failed.
    pause
    exit /b 1
  )
)

:: Install web deps if node_modules missing
if not exist "web\node_modules" (
  echo Installing web dependencies...
  cd web
  npm install
  if errorlevel 1 (
    echo ERROR: web npm install failed.
    pause
    exit /b 1
  )
  cd /d "%ROOT%"
)

echo Starting web UI on http://localhost:3000 ...
echo (This window must stay open)
echo.

:: Open browser after a short delay (start is non-blocking)
start "" cmd /c "timeout /t 3 >nul && start http://localhost:3000"

:: Start web dev server (foreground so window stays open)
npm run web:dev
pause
