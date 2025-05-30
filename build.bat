@echo off
chcp 65001 >nul

REM Git Log Explorer 编译脚本 (Windows)
echo 🚀 开始编译 Git Log Explorer 插件...

REM 检查是否安装了 npm
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ 错误: 未找到 npm，请先安装 Node.js
    pause
    exit /b 1
)

REM 检查是否安装了 vsce
npm list -g vsce >nul 2>nul
if %errorlevel% neq 0 (
    echo 📦 安装 vsce...
    npm install -g vsce
)

REM 安装项目依赖
echo 📦 安装项目依赖...
npm install

REM 编译 TypeScript
echo 🔨 编译 TypeScript...
npm run compile

if %errorlevel% neq 0 (
    echo ❌ TypeScript 编译失败
    pause
    exit /b 1
)

REM 打包 VSIX
echo 📦 打包 VSIX 文件...
npm run package

if %errorlevel% equ 0 (
    echo ✅ 编译完成！
    echo 📁 VSIX 文件已生成在当前目录
    dir *.vsix 2>nul || echo ⚠️ 未找到 VSIX 文件
) else (
    echo ❌ 打包失败
    pause
    exit /b 1
)

pause 