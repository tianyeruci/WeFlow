@echo off
setlocal

cd /d "%~dp0"

set "COMPOSE_CMD=docker compose"
docker compose version >nul 2>&1
if errorlevel 1 (
  set "COMPOSE_CMD=docker-compose"
  docker-compose version >nul 2>&1
  if errorlevel 1 (
    echo Docker Compose is not available.
    pause
    exit /b 1
  )
)

echo Using %COMPOSE_CMD%
echo Building WeFlow-Web Docker image...
%COMPOSE_CMD% build
if errorlevel 1 (
  echo.
  echo Build failed.
  pause
  exit /b 1
)

echo.
echo Build complete.
docker image ls weflow-web:latest
pause
