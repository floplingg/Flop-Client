@echo off
setlocal
title Flop Client
cd /d "%~dp0"
set "LOG=%~dp0flop-start-log.txt"

rem --- Running from inside the zip? Windows only extracts this one file, so nothing else is here. ---
if not exist "package.json" goto zipped
echo "%~dp0" | findstr /i /c:"Temp1_" >nul && goto zipped

rem --- Node.js installed? ---
where node >nul 2>nul || goto nonode
for /f "tokens=1 delims=." %%v in ('node -v') do set "NODEMAJ=%%v"
set "NODEMAJ=%NODEMAJ:v=%"
if %NODEMAJ% LSS 18 goto oldnode

rem --- Everything downloaded? (also repairs a half-finished first start) ---
if not exist "node_modules\electron\dist\electron.exe" goto install
goto run

:install
echo.
echo  First start: downloading what Flop needs.
echo  This takes a few minutes, one time only. Keep this window open.
echo.
if exist "node_modules\electron\package.json" goto getelectron
call npm install
if errorlevel 1 goto installfail

:getelectron
rem Newer npm versions block Electron's own download step. Try three ways to get it.
if exist "node_modules\electron\dist\electron.exe" goto run
echo.
echo  Downloading the Flop window engine (Electron)...
echo  [way 1 of 3] letting npm finish the setup
call npm install-scripts approve electron >nul 2>nul
call npm rebuild electron
if exist "node_modules\electron\dist\electron.exe" goto run

echo  [way 2 of 3] running Electron's own installer
call node "node_modules\electron\install.js"
if exist "node_modules\electron\dist\electron.exe" goto run

echo  [way 3 of 3] downloading straight from Electron's official GitHub page
for /f "delims=" %%v in ('node -p "require('./node_modules/electron/package.json').version"') do set "EV=%%v"
set "EARCH=x64"
if /i "%PROCESSOR_ARCHITECTURE%"=="ARM64" set "EARCH=arm64"
set "EURL=https://github.com/electron/electron/releases/download/v%EV%/electron-v%EV%-win32-%EARCH%.zip"
set "EZIP=%TEMP%\flop-electron-%EV%.zip"
echo  %EURL%
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; [Net.ServicePointManager]::SecurityProtocol='Tls12'; Invoke-WebRequest -Uri $env:EURL -OutFile $env:EZIP; Expand-Archive -Path $env:EZIP -DestinationPath 'node_modules\electron\dist' -Force; Remove-Item $env:EZIP"
if not exist "node_modules\electron\dist\electron.exe" goto installfail
<nul set /p "=electron.exe" > "node_modules\electron\path.txt"

:run
echo.
echo  Starting Flop Client... (keep this window open while you use Flop)
echo.
call npm start > "%LOG%" 2>&1
if errorlevel 1 goto runfail
exit /b

:zipped
echo.
echo  ============================================================
echo   Flop is still inside the zip file.
echo.
echo   1. Close this window.
echo   2. Find flop-client.zip in your Downloads folder.
echo   3. Right-click it and choose "Extract All...", then "Extract".
echo   4. Open the new flop-client folder that appears.
echo   5. Double-click "Start Flop (Windows).bat" in there.
echo  ============================================================
echo.
pause
exit /b

:nonode
echo.
echo  Node.js isn't installed yet.
echo  Go to https://nodejs.org, download the LTS version, install it,
echo  restart your computer, then run this file again.
echo.
pause
exit /b

:oldnode
echo.
echo  Your Node.js is too old (version %NODEMAJ%). Flop needs version 18 or newer.
echo  Go to https://nodejs.org, install the LTS version, then run this file again.
echo.
pause
exit /b

:installfail
echo.
echo  ============================================================
echo   Couldn't get the Flop window engine.
echo   Check your internet connection and run this file again.
echo   If it keeps failing, take a screenshot of this window
echo   and send it to Claude.
echo  ============================================================
echo.
pause
exit /b

:runfail
echo.
echo  ============================================================
echo   Flop Client stopped with an error. Here is what it said:
echo  ============================================================
echo.
type "%LOG%"
echo.
echo  This is also saved in flop-start-log.txt in this folder.
echo  Copy the text above (or send the file) to Claude to get it fixed.
echo.
pause
exit /b
