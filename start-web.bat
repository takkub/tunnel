@echo off
setlocal
set "ROOT=%~dp0"
set "WEB=%ROOT%web"

if not exist "%WEB%\.next" (
    echo Building web app (first time takes 1-2 min^)...
    cd /d "%WEB%"
    node node_modules\next\dist\bin\next build
    if errorlevel 1 (
        echo Build failed. Check output above.
        pause
        exit /b 1
    )
)

echo Starting Tunnel Web Admin on http://localhost:8888 ...
cd /d "%WEB%"
start "Tunnel Web Admin" /MIN node node_modules\next\dist\bin\next start -p 8888

timeout /t 4 /nobreak > nul
start http://localhost:8888
echo Web Admin started at http://localhost:8888
echo (Close the "Tunnel Web Admin" window to stop the server)
