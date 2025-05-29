@echo off
chcp 65001 >nul

echo 🚀 Git Log Explorer v1.0.0 安装脚本
echo ==================================

REM 检查Node.js
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ 错误: 未找到Node.js，请先安装Node.js 16.x或更高版本
    pause
    exit /b 1
)

REM 检查npm
npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ 错误: 未找到npm，请确保npm已正确安装
    pause
    exit /b 1
)

echo ✅ Node.js版本: 
node --version
echo ✅ npm版本: 
npm --version
echo.

REM 安装依赖
echo 📦 安装依赖...
npm install
if %errorlevel% neq 0 (
    echo ❌ 依赖安装失败
    pause
    exit /b 1
)
echo ✅ 依赖安装成功

REM 编译TypeScript
echo 🔨 编译TypeScript...
npm run compile
if %errorlevel% neq 0 (
    echo ❌ 编译失败
    pause
    exit /b 1
)
echo ✅ 编译成功

echo.
echo 🎉 安装完成！
echo.
echo 📖 使用说明:
echo 1. 在VSCode中按 Ctrl+Shift+P 打开命令面板
echo 2. 输入 'Extensions: Install from VSIX'
echo 3. 选择生成的 .vsix 文件进行安装
echo.
echo 或者运行以下命令打包插件:
echo npm run package

pause 