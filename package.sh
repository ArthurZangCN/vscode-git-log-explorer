#!/bin/bash

echo "📦 开始打包 Cursor Git Log Explorer 插件..."

# 检查是否安装了 vsce
if ! command -v vsce &> /dev/null; then
    echo "📥 安装 vsce (Visual Studio Code Extension Manager)..."
    npm install -g vsce
    
    if [ $? -ne 0 ]; then
        echo "❌ 安装 vsce 失败"
        exit 1
    fi
fi

echo "✅ vsce 已安装"

# 编译项目
echo "🔨 编译项目..."
npm run compile

if [ $? -ne 0 ]; then
    echo "❌ 编译失败"
    exit 1
fi

echo "✅ 编译成功"

# 打包插件
echo "📦 打包插件..."
vsce package

if [ $? -eq 0 ]; then
    echo "✅ 插件打包成功！"
    echo ""
    echo "📋 生成的文件:"
    ls -la *.vsix 2>/dev/null || echo "未找到 .vsix 文件"
    echo ""
    echo "🚀 安装插件:"
    echo "1. 在 Cursor 中按 Ctrl+Shift+P"
    echo "2. 输入 'Extensions: Install from VSIX'"
    echo "3. 选择生成的 .vsix 文件"
    echo ""
    echo "或者使用命令行:"
    for file in *.vsix; do
        if [ -f "$file" ]; then
            echo "code --install-extension $file"
        fi
    done
else
    echo "❌ 打包失败"
    exit 1
fi 