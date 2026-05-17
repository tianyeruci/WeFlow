@echo off
setlocal

set "ROOT=%~dp0"
set "WEB_DIR=%ROOT%WeFlow-Web"
set "APP_DIR=%ROOT%WeFlow-main"
set "WEB_PORT=3001"
set "SYNC_URL=http://127.0.0.1:%WEB_PORT%/api/invite/sync"
set "ENV_FILE=%WEB_DIR%\.env.local"

if not exist "%WEB_DIR%\package.json" (
  echo [ERROR] Cannot find WeFlow-Web at "%WEB_DIR%".
  pause
  exit /b 1
)

if not exist "%APP_DIR%\package.json" (
  echo [ERROR] Cannot find WeFlow-main at "%APP_DIR%".
  pause
  exit /b 1
)

if not exist "%ENV_FILE%" (
  echo [ERROR] Cannot find "%ENV_FILE%".
  echo Please create WeFlow-Web\.env.local first.
  pause
  exit /b 1
)

for /f "usebackq tokens=1,* delims==" %%A in ("%ENV_FILE%") do (
  if /i "%%A"=="REMOTE_SYNC_TOKEN" set "WEFLOW_INVITE_SYNC_TOKEN=%%B"
)

if not defined WEFLOW_INVITE_SYNC_TOKEN (
  echo [ERROR] REMOTE_SYNC_TOKEN is missing in "%ENV_FILE%".
  pause
  exit /b 1
)

set "WEFLOW_INVITE_SYNC_URL=%SYNC_URL%"
set "PORT=%WEB_PORT%"

rem Clear broken local proxy settings that can block localhost/Supabase requests.
set "HTTP_PROXY="
set "HTTPS_PROXY="
set "ALL_PROXY="
set "http_proxy="
set "https_proxy="
set "all_proxy="
set "NO_PROXY=127.0.0.1,localhost"
set "no_proxy=127.0.0.1,localhost"

echo Starting WeFlow-Web on http://127.0.0.1:%WEB_PORT% ...
start "WeFlow Web API" /D "%WEB_DIR%" cmd /k "npm run dev"

echo Waiting for WeFlow-Web to become ready ...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$deadline=(Get-Date).AddSeconds(45); do { try { $r=Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 'http://127.0.0.1:%WEB_PORT%/api/invite/tags'; if ($r.StatusCode -lt 500) { exit 0 } } catch {}; Start-Sleep -Seconds 2 } while ((Get-Date) -lt $deadline); exit 1"
if errorlevel 1 (
  echo [WARN] Web API did not respond within 45 seconds. Starting desktop app anyway.
)

echo Starting WeFlow desktop app ...
start "WeFlow Desktop" /D "%APP_DIR%" cmd /k "npm run electron:dev"

echo.
echo WeFlow startup commands have been launched.
echo Web:  http://127.0.0.1:%WEB_PORT%
echo Sync: %WEFLOW_INVITE_SYNC_URL%
echo.
endlocal
