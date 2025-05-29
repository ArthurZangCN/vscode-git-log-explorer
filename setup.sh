#!/bin/bash

echo "🚀 开始设置 Cursor Git Log Explorer 插件..."

# 检查是否安装了 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 错误: 未检测到 Node.js，请先安装 Node.js"
    exit 1
fi

# 检查是否安装了 npm
if ! command -v npm &> /dev/null; then
    echo "❌ 错误: 未检测到 npm，请先安装 npm"
    exit 1
fi

echo "✅ Node.js 和 npm 已安装"

# 安装依赖
echo "📦 正在安装依赖..."
npm install

if [ $? -eq 0 ]; then
    echo "✅ 依赖安装成功"
else
    echo "❌ 依赖安装失败"
    exit 1
fi

# 编译 TypeScript
echo "🔨 正在编译 TypeScript..."
npm run compile

if [ $? -eq 0 ]; then
    echo "✅ 编译成功"
else
    echo "❌ 编译失败"
    exit 1
fi

# 创建 .vscode 目录和配置文件
echo "⚙️ 创建开发配置..."
mkdir -p .vscode

cat > .vscode/launch.json << 'EOF'
{
    "version": "0.2.0",
    "configurations": [
        {
            "name": "运行扩展",
            "type": "extensionHost",
            "request": "launch",
            "args": [
                "--extensionDevelopmentPath=${workspaceFolder}"
            ],
            "outFiles": [
                "${workspaceFolder}/out/**/*.js"
            ],
            "preLaunchTask": "${workspaceFolder}/npm: watch"
        }
    ]
}
EOF

cat > .vscode/tasks.json << 'EOF'
{
    "version": "2.0.0",
    "tasks": [
        {
            "type": "npm",
            "script": "watch",
            "problemMatcher": "$tsc-watch",
            "isBackground": true,
            "presentation": {
                "reveal": "never"
            },
            "group": {
                "kind": "build",
                "isDefault": true
            }
        }
    ]
}
EOF

cat > .vscode/settings.json << 'EOF'
{
    "typescript.preferences.includePackageJsonAutoImports": "off"
}
EOF

echo "✅ 开发配置创建完成"

# 创建 .gitignore 文件
cat > .gitignore << 'EOF'
node_modules/
out/
*.vsix
.DS_Store
*.log
EOF

echo "✅ .gitignore 文件创建完成"

echo ""
echo "🎉 设置完成！"
echo ""
echo "📋 接下来的步骤："
echo "1. 在 Cursor 中打开这个项目目录"
echo "2. 按 F5 启动调试模式"
echo "3. 在新打开的 Cursor 窗口中测试插件功能"
echo ""
echo "💡 提示："
echo "- 使用 'npm run watch' 启动自动编译模式"
echo "- 使用 'npm run compile' 手动编译"
echo "- 确保测试目录是一个 Git 仓库"
echo ""
echo "📚 查看 README.md 了解详细使用说明" 