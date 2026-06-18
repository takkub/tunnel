@echo off
setlocal enabledelayedexpansion

echo ==========================================
echo  Tunnel Manager - Windows Installer
echo ==========================================
echo.

REM Check Node.js
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is not installed.
    echo.
    echo Please install Node.js first:
    echo   Option 1: winget install OpenJS.NodeJS
    echo   Option 2: https://nodejs.org
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node --version') do set NODE_VER=%%i
echo [OK] Node.js %NODE_VER% found

REM Check/Download cloudflared
if not exist cloudflared.exe (
    echo [INFO] cloudflared.exe not found. Downloading...
    curl -L -o cloudflared.exe https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe
    if errorlevel 1 (
        echo [ERROR] Failed to download cloudflared.exe
        echo Please download manually: https://github.com/cloudflare/cloudflared/releases
        pause
        exit /b 1
    )
    echo [OK] cloudflared.exe downloaded
) else (
    echo [OK] cloudflared.exe already present
)

REM npm install (root)
echo.
echo [INFO] Installing root dependencies...
npm install
if errorlevel 1 (
    echo [ERROR] npm install (root) failed
    pause
    exit /b 1
)
echo [OK] Root dependencies installed

REM npm install (web)
echo.
echo [INFO] Installing web dependencies...
pushd web
npm install
if errorlevel 1 (
    popd
    echo [ERROR] npm install (web) failed
    pause
    exit /b 1
)
popd
echo [OK] Web dependencies installed

REM .env setup
if not exist .env (
    copy .env.example .env >nul
    echo [OK] .env created from .env.example
    echo [!] Edit .env and fill in CLOUDFLARE_API_TOKEN and ZONE_ID
) else (
    echo [OK] .env already exists
)

REM Check Docker (optional)
where docker >nul 2>&1
if errorlevel 1 (
    echo [INFO] Docker not found (optional — native cloudflared will be used)
) else (
    for /f "tokens=*" %%i in ('docker --version') do echo [OK] %%i
)

echo.
echo ==========================================
echo  Installation complete!
echo ==========================================
echo.
echo Next steps:
echo   1. Edit .env  -  set CLOUDFLARE_API_TOKEN and ZONE_ID
echo   2. Login:       npm run login
echo   3. Web UI:      npm run web:dev  (http://localhost:3000)
echo      or double-click  tunnels\^<name^>\start.bat  to launch a tunnel
echo.
pause
