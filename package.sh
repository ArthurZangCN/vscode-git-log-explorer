#!/bin/bash

echo "📦 Git Log Explorer v1.0.0 打包脚本"
echo "================================="

# 检查是否安装了vsce
if ! command -v vsce &> /dev/null; then
    echo "⚠️  未找到vsce，正在安装..."
    npm install -g vsce
    
    if [ $? -ne 0 ]; then
        echo "❌ vsce安装失败，请手动安装: npm install -g vsce"
        exit 1
    fi
    echo "✅ vsce安装成功"
fi

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
    echo ""
    echo "🎉 打包成功！"
    echo ""
    echo "📁 生成的文件:"
    ls -la *.vsix 2>/dev/null || echo "未找到.vsix文件"
    echo ""
    echo "📖 安装说明:"
    echo "1. 在VSCode中按 Ctrl+Shift+P"
    echo "2. 输入 'Extensions: Install from VSIX'"
    echo "3. 选择生成的 .vsix 文件"
    echo ""
    echo "🚀 享受Git Log Explorer！"
else
    echo "❌ 打包失败"
    exit 1
fi 