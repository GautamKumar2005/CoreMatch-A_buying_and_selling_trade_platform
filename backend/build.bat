@echo off
echo ============================================
echo   CoreMatch Exchange - Windows Build Script
echo ============================================
echo.

:: Check for vcpkg
where vcpkg >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] vcpkg found
    goto run_build
)

echo [INFO] vcpkg not found in PATH. Bootstrapping...
if not exist "C:\vcpkg" (
    git clone https://github.com/microsoft/vcpkg.git C:\vcpkg
    call C:\vcpkg\bootstrap-vcpkg.bat
    setx VCPKG_ROOT "C:\vcpkg" /M
)
set VCPKG_ROOT=C:\vcpkg
set "PATH=%PATH%;C:\vcpkg"

:run_build

echo.
echo [STEP 1] Installing dependencies via vcpkg (this may take 10-20 minutes first run)...
vcpkg install --triplet x64-windows

echo.
echo [STEP 2] Configuring CMake...
if not exist build mkdir build
cmake -B build -S . ^
    -DCMAKE_TOOLCHAIN_FILE=C:/vcpkg/scripts/buildsystems/vcpkg.cmake ^
    -DVCPKG_TARGET_TRIPLET=x64-windows ^
    -DCMAKE_BUILD_TYPE=Release ^
    -G "Visual Studio 17 2022" ^
    -A x64

echo.
echo [STEP 3] Building in Release mode...
cmake --build build --config Release --parallel

if %errorlevel% equ 0 (
    echo.
    echo [SUCCESS] Build complete!
    echo   Executable: build\Release\exchange_server.exe
    echo.
    echo [NEXT] Copy .env to build\Release\ and run:
    echo   build\Release\exchange_server.exe
) else (
    echo.
    echo [ERROR] Build failed. See output above.
    exit /b 1
)
