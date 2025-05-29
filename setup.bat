@echo off
chcp 65001 >nul
echo 🚀 开始设置 Cursor Git Log Explorer 插件...

REM 检查是否安装了 Node.js
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ 错误: 未检测到 Node.js，请先安装 Node.js
    pause
    exit /b 1
)

REM 检查是否安装了 npm
npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ 错误: 未检测到 npm，请先安装 npm
    pause
    exit /b 1
)

echo ✅ Node.js 和 npm 已安装

REM 安装依赖
echo 📦 正在安装依赖...
call npm install
if %errorlevel% neq 0 (
    echo ❌ 依赖安装失败
    pause
    exit /b 1
)
echo ✅ 依赖安装成功

REM 编译 TypeScript
echo 🔨 正在编译 TypeScript...
call npm run compile
if %errorlevel% neq 0 (
    echo ❌ 编译失败
    pause
    exit /b 1
)
echo ✅ 编译成功

REM 创建 .vscode 目录和配置文件
echo ⚙️ 创建开发配置...
if not exist .vscode mkdir .vscode

echo {> .vscode\launch.json
echo     "version": "0.2.0",>> .vscode\launch.json
echo     "configurations": [>> .vscode\launch.json
echo         {>> .vscode\launch.json
echo             "name": "运行扩展",>> .vscode\launch.json
echo             "type": "extensionHost",>> .vscode\launch.json
echo             "request": "launch",>> .vscode\launch.json
echo             "args": [>> .vscode\launch.json
echo                 "--extensionDevelopmentPath=${workspaceFolder}">> .vscode\launch.json
echo             ],>> .vscode\launch.json
echo             "outFiles": [>> .vscode\launch.json
echo                 "${workspaceFolder}/out/**/*.js">> .vscode\launch.json
echo             ],>> .vscode\launch.json
echo             "preLaunchTask": "${workspaceFolder}/npm: watch">> .vscode\launch.json
echo         }>> .vscode\launch.json
echo     ]>> .vscode\launch.json
echo }>> .vscode\launch.json

echo {> .vscode\tasks.json
echo     "version": "2.0.0",>> .vscode\tasks.json
echo     "tasks": [>> .vscode\tasks.json
echo         {>> .vscode\tasks.json
echo             "type": "npm",>> .vscode\tasks.json
echo             "script": "watch",>> .vscode\tasks.json
echo             "problemMatcher": "$tsc-watch",>> .vscode\tasks.json
echo             "isBackground": true,>> .vscode\tasks.json
echo             "presentation": {>> .vscode\tasks.json
echo                 "reveal": "never">> .vscode\tasks.json
echo             },>> .vscode\tasks.json
echo             "group": {>> .vscode\tasks.json
echo                 "kind": "build",>> .vscode\tasks.json
echo                 "isDefault": true>> .vscode\tasks.json
echo             }>> .vscode\tasks.json
echo         }>> .vscode\tasks.json
echo     ]>> .vscode\tasks.json
echo }>> .vscode\tasks.json

echo {> .vscode\settings.json
echo     "typescript.preferences.includePackageJsonAutoImports": "off">> .vscode\settings.json
echo }>> .vscode\settings.json

echo ✅ 开发配置创建完成

REM 创建 .gitignore 文件
echo node_modules/> .gitignore
echo out/>> .gitignore
echo *.vsix>> .gitignore
echo .DS_Store>> .gitignore
echo *.log>> .gitignore

echo ✅ .gitignore 文件创建完成

echo.
echo 🎉 设置完成！
echo.
echo 📋 接下来的步骤：
echo 1. 在 Cursor 中打开这个项目目录
echo 2. 按 F5 启动调试模式
echo 3. 在新打开的 Cursor 窗口中测试插件功能
echo.
echo 💡 提示：
echo - 使用 'npm run watch' 启动自动编译模式
echo - 使用 'npm run compile' 手动编译
echo - 确保测试目录是一个 Git 仓库
echo.
echo 📚 查看 README.md 了解详细使用说明
pause 