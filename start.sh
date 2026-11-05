#!/bin/sh
# Starts the REA-BOSS GT-1 editor on http://localhost:8123 (macOS / Linux).
# Web MIDI only works on localhost or https, so the page must be served, not opened as a file.
cd "$(dirname "$0")" || exit 1
URL="http://localhost:8123/"
PY=python3
command -v "$PY" >/dev/null 2>&1 || PY=python
( sleep 1
  if command -v open >/dev/null 2>&1; then open "$URL"
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL"
  fi ) &
exec "$PY" -m http.server 8123 --bind 127.0.0.1 -d app
