@echo off
setlocal EnableExtensions

title My Financer - Reset de Acesso

echo Este reset remove somente o acesso do My Financer:
echo - usuario e senha do app
echo - tokens de ativacao
echo - sessao e identificador deste computador
echo.
echo Sera preservado: lancamentos, categorias, metas, configuracoes, backups e uploads.
echo.
set /p CONFIRM=Digite RESET MY FINANCER para continuar: 
if /I not "%CONFIRM%"=="RESET MY FINANCER" (
  echo Operacao cancelada.
  exit /b 1
)

taskkill /F /IM "My Financer.exe" >nul 2>&1
taskkill /F /IM "My Financer Admin.exe" >nul 2>&1

set "APPDATA_DIR=%APPDATA%\My Financer"
set "DB_FILE=%APPDATA_DIR%\financer_db.sqlite"
if not exist "%DB_FILE%" (
  echo Banco do My Financer nao encontrado em:
  echo %DB_FILE%
  echo Nenhum arquivo foi alterado.
  exit /b 2
)

for /f "tokens=1-4 delims=/:. " %%a in ("%date% %time%") do set "STAMP=%%d%%c%%b_%%a%%e%%f"
set "BACKUP_FILE=%APPDATA_DIR%\financer_db_before_auth_reset_%STAMP%.sqlite"
copy /Y "%DB_FILE%" "%BACKUP_FILE%" >nul
if errorlevel 1 (
  echo Falha ao criar backup de seguranca. Nenhum dado foi resetado.
  exit /b 3
)

set "APP_EXE=%LOCALAPPDATA%\Programs\My Financer\My Financer.exe"
if not exist "%APP_EXE%" set "APP_EXE=%~dp0release\win-unpacked\My Financer.exe"
if not exist "%APP_EXE%" (
  echo Executavel do My Financer nao encontrado.
  echo Backup criado em: %BACKUP_FILE%
  exit /b 4
)

echo Backup criado em:
echo %BACKUP_FILE%
echo Executando reset seletivo...
start "" /wait "%APP_EXE%" --reset-auth
if errorlevel 1 (
  echo O reset pode nao ter sido concluido. O backup permanece disponivel.
  exit /b 5
)

del /Q "%APPDATA_DIR%\device-id" >nul 2>&1
echo.
echo Reset concluido. Seus dados financeiros foram preservados.
echo Gere um novo token no My Financer Admin e ative o app novamente.
pause
exit /b 0