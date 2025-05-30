#!/bin/bash

# Git Log Explorer 编译脚本
echo "🚀 开始编译 Git Log Explorer 插件..."

# 检查是否安装了必要的依赖
if ! command -v npm &> /dev/null; then
    echo "❌ 错误: 未找到 npm，请先安装 Node.js"
    exit 1
fi

# 检查是否安装了 vsce
if ! npm list -g vsce &> /dev/null; then
    echo "📦 安装 vsce..."
    npm install -g vsce
fi

# 安装项目依赖
echo "📦 安装项目依赖..."
npm install

# 编译 TypeScript
echo "🔨 编译 TypeScript..."
npm run compile

if [ $? -ne 0 ]; then
    echo "❌ TypeScript 编译失败"
    exit 1
fi

# 打包 VSIX
echo "📦 打包 VSIX 文件..."
npm run package

if [ $? -eq 0 ]; then
    echo "✅ 编译完成！"
    echo "📁 VSIX 文件已生成在当前目录"
    ls -la *.vsix 2>/dev/null || echo "⚠️ 未找到 VSIX 文件"
else
    echo "❌ 打包失败"
    exit 1
fi 