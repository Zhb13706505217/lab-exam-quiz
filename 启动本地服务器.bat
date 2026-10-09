@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo   上岗证刷题 - 本地预览
echo   ------------------------------------------
echo   浏览器会自动打开 http://127.0.0.1:8137
echo   手机与电脑同一 WiFi 时，可用手机 Safari 打开 http://本机IP:8137
echo   关闭本窗口即停止服务
echo.

where python >nul 2>nul
if %errorlevel%==0 (
  start "" http://127.0.0.1:8137/index.html
  python -m http.server 8137
  goto :eof
)

where py >nul 2>nul
if %errorlevel%==0 (
  start "" http://127.0.0.1:8137/index.html
  py -m http.server 8137
  goto :eof
)

echo   没有检测到 Python，正在直接用浏览器打开本地文件...
start "" "%~dp0index.html"
echo   （直接打开也能正常刷题；如需手机访问，请安装 Python 或把文件夹上传到网站空间）
pause
