@echo off
rem Starts the REA-BOSS GT-1 editor on http://localhost:8123 and opens it.
rem Web MIDI only works on localhost or https, so the page must be served, not opened as a file.
cd /d "%~dp0"
start "" "http://localhost:8123/"
python -m http.server 8123 --bind 127.0.0.1 -d app
