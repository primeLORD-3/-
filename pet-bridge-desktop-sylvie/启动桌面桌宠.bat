@echo off
setlocal
cd /d "%~dp0"
if not exist node_modules\electron (
  echo Installing Electron runtime...
  call npm install
)
call npm start
