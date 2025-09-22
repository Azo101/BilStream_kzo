@echo off
set PORT=5500
start "" http://127.0.0.1:%PORT%/
python -m http.server %PORT%
