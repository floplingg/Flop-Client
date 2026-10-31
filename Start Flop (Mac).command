#!/bin/bash
cd "$(dirname "$0")"
pause(){ read -n 1 -s -r -p "Press any key to close"; echo; }
if [ ! -f package.json ]; then
  echo ""; echo "  Flop is still inside the zip. Double-click flop-client.zip to unzip it,"
  echo "  open the new flop-client folder, and run this file from there."; echo ""; pause; exit 1
fi
if ! command -v node >/dev/null 2>&1; then
  echo ""; echo "  Node.js isn't installed yet. Get the LTS version from https://nodejs.org, then run this again."; echo ""; pause; exit 1
fi
if [ ! -d node_modules/electron/dist ]; then
  echo "  First start: downloading what Flop needs. This takes a few minutes, one time only..."
  if [ ! -f node_modules/electron/package.json ]; then
    npm install || { echo ""; echo "  The download didn't finish. Check your internet and try again."; pause; exit 1; }
  fi
  # Newer npm versions skip Electron's own download step, so run it directly.
  [ -d node_modules/electron/dist ] || node node_modules/electron/install.js
  [ -d node_modules/electron/dist ] || { echo ""; echo "  Couldn't download the Flop window engine. Check your internet and try again."; pause; exit 1; }
fi
echo "  Starting Flop Client... (keep this window open)"
if ! npm start > flop-start-log.txt 2>&1; then
  echo ""; echo "  Flop stopped with an error:"; echo ""; cat flop-start-log.txt; echo ""
  echo "  Send this text (or flop-start-log.txt) to Claude to get it fixed."; pause; exit 1
fi
