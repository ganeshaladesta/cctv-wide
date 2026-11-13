@echo off
title SCC EAGLE EYES - Sinkronisasi Excel Unras Otomatis
color 0A
cd /d "d:\MORNINGSTAR\cctv"
node scripts/sync-local-excel.mjs
echo.
echo Tekan tombol apa saja untuk menutup jendela ini...
pause >nul
