@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion

:: ============================================================
::  厉影AI 打包脚本
::  支持架构: x64 (64位), ia32 (32位), arm64 (ARM芯片)
::  用法:
::    build.bat              - 交互式选择
::    build.bat x64          - 只打 64位
::    build.bat ia32         - 只打 32位
::    build.bat arm64        - 只打 ARM64
::    build.bat all          - 打包所有架构
::    build.bat x64 ia32     - 打包指定多个架构
:: ============================================================

set "PROJECT_DIR=%~dp0"
cd /d "%PROJECT_DIR%"

:: 读取 package.json 中的版本号
for /f "tokens=2 delims=:, " %%a in ('findstr /c:"\"version\"" package.json') do (
    set "APP_VERSION=%%~a"
)
set "APP_NAME=liying-ai"

echo.
echo  ╔══════════════════════════════════════════╗
echo  ║         厉影AI 安装包打包工具            ║
echo  ║         版本: %APP_VERSION%                      ║
echo  ╚══════════════════════════════════════════╝
echo.

:: 解析参数
set "BUILD_X64=0"
set "BUILD_IA32=0"
set "BUILD_ARM64=0"
set "HAS_ARGS=0"

if "%~1"=="" goto :interactive

:parse_args
if "%~1"=="" goto :start_build
set "HAS_ARGS=1"
if /i "%~1"=="x64"   ( set "BUILD_X64=1"   & shift & goto :parse_args )
if /i "%~1"=="64"    ( set "BUILD_X64=1"   & shift & goto :parse_args )
if /i "%~1"=="ia32"  ( set "BUILD_IA32=1"  & shift & goto :parse_args )
if /i "%~1"=="32"    ( set "BUILD_IA32=1"  & shift & goto :parse_args )
if /i "%~1"=="x86"   ( set "BUILD_IA32=1"  & shift & goto :parse_args )
if /i "%~1"=="arm64" ( set "BUILD_ARM64=1" & shift & goto :parse_args )
if /i "%~1"=="arm"   ( set "BUILD_ARM64=1" & shift & goto :parse_args )
if /i "%~1"=="all"   ( set "BUILD_X64=1" & set "BUILD_IA32=1" & set "BUILD_ARM64=1" & shift & goto :parse_args )
echo  [警告] 未知参数: %~1 (支持: x64/64, ia32/32/x86, arm64/arm, all)
shift
goto :parse_args

:interactive
echo  请选择要打包的架构:
echo.
echo    [1] x64   - 64位 (推荐, 主流Windows电脑)
echo    [2] ia32  - 32位 (旧电脑兼容)
echo    [3] arm64 - ARM  (Surface Pro X / 骁龙笔记本)
echo    [4] x64 + ia32       - 同时打64位和32位
echo    [5] 全部架构          - x64 + ia32 + arm64
echo    [0] 退出
echo.
set /p "CHOICE=  请输入选项 [1-5, 0退出]: "

if "%CHOICE%"=="1" ( set "BUILD_X64=1" & set "HAS_ARGS=1" )
if "%CHOICE%"=="2" ( set "BUILD_IA32=1" & set "HAS_ARGS=1" )
if "%CHOICE%"=="3" ( set "BUILD_ARM64=1" & set "HAS_ARGS=1" )
if "%CHOICE%"=="4" ( set "BUILD_X64=1" & set "BUILD_IA32=1" & set "HAS_ARGS=1" )
if "%CHOICE%"=="5" ( set "BUILD_X64=1" & set "BUILD_IA32=1" & set "BUILD_ARM64=1" & set "HAS_ARGS=1" )
if "%CHOICE%"=="0" ( echo  已取消. & exit /b 0 )

if "%HAS_ARGS%"=="0" (
    echo  [错误] 无效选项，请重新运行
    exit /b 1
)

:start_build
:: 显示打包计划
echo.
echo  ── 打包计划 ──────────────────────────────
if "%BUILD_X64%"=="1"   echo    √ Windows x64  (64位)
if "%BUILD_IA32%"=="1"  echo    √ Windows ia32 (32位)
if "%BUILD_ARM64%"=="1" echo    √ Windows arm64 (ARM)
echo  ──────────────────────────────────────────
echo.

:: Step 1: 编译前端和主进程
echo  [1/3] 编译项目 (electron-vite build)...
echo  ─────────────────────────────────────
call npm run build
if %errorlevel% neq 0 (
    echo.
    echo  [错误] 编译失败！请检查代码错误。
    exit /b 1
)
echo  [OK] 编译完成
echo.

:: Step 2: 清理旧的dist
echo  [2/3] 清理旧的打包文件...
if exist "dist" rd /s /q "dist"
echo  [OK] 已清理
echo.

:: Step 3: 按架构逐个打包
set "BUILD_COUNT=0"
set "BUILD_SUCCESS=0"
set "BUILD_FAILED=0"
set "OUTPUT_FILES="

if "%BUILD_X64%"=="1" (
    set /a BUILD_COUNT+=1
    call :build_arch x64 "64位"
)

if "%BUILD_IA32%"=="1" (
    set /a BUILD_COUNT+=1
    call :build_arch ia32 "32位"
)

if "%BUILD_ARM64%"=="1" (
    set /a BUILD_COUNT+=1
    call :build_arch arm64 "ARM64"
)

:: 打包结果汇总
echo.
echo  ╔══════════════════════════════════════════╗
echo  ║            打包结果汇总                  ║
echo  ╠══════════════════════════════════════════╣
echo  ║  总计: %BUILD_COUNT% 个架构                          ║
echo  ║  成功: %BUILD_SUCCESS% 个                              ║
echo  ║  失败: %BUILD_FAILED% 个                              ║
echo  ╚══════════════════════════════════════════╝
echo.
echo  输出目录: %PROJECT_DIR%dist\
echo.

:: 列出生成的安装包
echo  生成的安装包:
echo  ─────────────────────────────────────
for %%f in (dist\*-setup*.exe) do (
    for %%s in ("%%f") do (
        set "FSIZE=%%~zs"
        set /a "FSIZE_MB=!FSIZE! / 1048576"
        echo    %%~nxf  (!FSIZE_MB! MB^)
    )
)
echo.

if "%BUILD_FAILED%"=="0" (
    echo  全部打包成功！
) else (
    echo  部分架构打包失败，请查看上方日志。
)

exit /b 0

:: ============================================================
::  子函数: 打包指定架构
::  参数: %1=架构(x64/ia32/arm64)  %2=显示名称
:: ============================================================
:build_arch
set "ARCH=%~1"
set "ARCH_NAME=%~2"

echo  [3/%BUILD_COUNT%] 打包 Windows %ARCH_NAME% (%ARCH%)...
echo  ─────────────────────────────────────

:: 运行 electron-builder
call npx electron-builder --win --arch=%ARCH%

if %errorlevel% neq 0 (
    echo  [失败] %ARCH_NAME% (%ARCH%) 打包失败！
    set /a BUILD_FAILED+=1
    echo.
    goto :eof
)

:: 检查输出文件
set "SETUP_FILE="
for %%f in (dist\*-%ARCH%-setup*.exe dist\*-setup*.exe) do (
    set "SETUP_FILE=%%f"
)

:: 重命名安装包，加上架构标识（避免覆盖）
if "%ARCH%"=="x64" set "ARCH_SUFFIX=x64"
if "%ARCH%"=="ia32" set "ARCH_SUFFIX=x86"
if "%ARCH%"=="arm64" set "ARCH_SUFFIX=arm64"

set "FINAL_NAME=%APP_NAME%-%APP_VERSION%-%ARCH_SUFFIX%-setup.exe"
if exist "dist\%APP_NAME%-%APP_VERSION%-setup.exe" (
    if not exist "dist\%FINAL_NAME%" (
        move "dist\%APP_NAME%-%APP_VERSION%-setup.exe" "dist\%FINAL_NAME%" >nul 2>&1
    )
)

echo  [成功] %ARCH_NAME% (%ARCH%): dist\%FINAL_NAME%
set /a BUILD_SUCCESS+=1
echo.
goto :eof
