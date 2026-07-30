@echo off
echo ============================================
echo   CoreMatch Exchange - CLI Compiler Script
echo ============================================
echo.

setlocal

if exist matching_engine.exe del matching_engine.exe

:: Try to find Visual Studio 2022 MSVC Build Tools
if exist "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvarsall.bat" (
    set "VCVARS=C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvarsall.bat"
    goto found_vcvars
)
if exist "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvarsall.bat" (
    set "VCVARS=C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvarsall.bat"
    goto found_vcvars
)
if exist "C:\Program Files\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvarsall.bat" (
    set "VCVARS=C:\Program Files\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvarsall.bat"
    goto found_vcvars
)
if exist "C:\Program Files\Microsoft Visual Studio\2022\Professional\VC\Auxiliary\Build\vcvarsall.bat" (
    set "VCVARS=C:\Program Files\Microsoft Visual Studio\2022\Professional\VC\Auxiliary\Build\vcvarsall.bat"
    goto found_vcvars
)
if exist "C:\Program Files\Microsoft Visual Studio\2022\Enterprise\VC\Auxiliary\Build\vcvarsall.bat" (
    set "VCVARS=C:\Program Files\Microsoft Visual Studio\2022\Enterprise\VC\Auxiliary\Build\vcvarsall.bat"
    goto found_vcvars
)

goto try_msvc_direct

:found_vcvars
echo [INFO] Found Visual Studio 2022 Build Tools at: "%VCVARS%"
echo [INFO] Initializing MSVC x64 build environment...

:: Clean PATH before calling to prevent pollution breaking vcvarsall
set "OLD_PATH=%PATH%"
set "PATH=C:\Windows\system32;C:\Windows;C:\Windows\System32\Wbem;C:\Windows\System32\WindowsPowerShell\v1.0"
call "%VCVARS%" x64 >nul
set "PATH=%PATH%;%OLD_PATH%"

:try_msvc_direct
where cl >nul 2>&1
if %errorlevel% neq 0 goto try_gxx

echo [INFO] Compiling with MSVC cl.exe...
cl /EHsc /O2 /std:c++20 src/main_cli.cpp src/engine/order_book.cpp src/engine/matching_engine.cpp /Fe:matching_engine.exe

if exist matching_engine.exe (
    if exist main_cli.obj del main_cli.obj
    if exist order_book.obj del order_book.obj
    if exist matching_engine.obj del matching_engine.obj
    echo [SUCCESS] Compiled successfully with MSVC cl.exe!
    exit /b 0
)

:try_gxx
where g++ >nul 2>&1
if %errorlevel% neq 0 goto compile_fail

echo [INFO] Found g++. Compiling with g++...
g++ -std=c++20 -O3 src/main_cli.cpp src/engine/order_book.cpp src/engine/matching_engine.cpp -o matching_engine.exe
if exist matching_engine.exe (
    echo [SUCCESS] Compiled successfully with g++!
    exit /b 0
)

:compile_fail
echo [ERROR] No C++20 compiler found or compilation failed.
exit /b 1
