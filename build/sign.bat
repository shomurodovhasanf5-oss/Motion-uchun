@echo off
REM ============================================================
REM  Shomurodov motion - .zxp yasash skripti (Windows)
REM  Talab: ZXPSignCmd.exe shu papkada bo'lsin.
REM  Ishlatish:  build\sign.bat
REM ============================================================
setlocal
set ROOT=%~dp0..
set OUT=%~dp0ShomurodovMotion.zxp
set CERT=%~dp0cert.p12
set PASS=parol123

REM 1) Sertifikat yo'q bo'lsa, o'zi yaratadi
if not exist "%CERT%" (
  echo [1/2] Sertifikat yaratilmoqda...
  "%~dp0ZXPSignCmd.exe" -selfSignedCert UZ Tashkent ShomurodovBro Hasan %PASS% "%CERT%"
)

REM 2) Plaginni imzolab .zxp yasaydi
echo [2/2] .zxp yasalmoqda...
"%~dp0ZXPSignCmd.exe" -sign "%ROOT%" "%OUT%" "%CERT%" %PASS% -tsa http://timestamp.digicert.com

echo.
echo Tayyor: %OUT%
pause
