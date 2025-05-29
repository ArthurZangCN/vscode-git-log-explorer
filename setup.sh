#!/bin/bash

echo "🚀 Git Log Explorer v1.0.0 安装脚本"
echo "=================================="

# 检查Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 错误: 未找到Node.js，请先安装Node.js 16.x或更高版本"
    exit 1
fi

# 检查npm
if ! command -v npm &> /dev/null; then
    echo "❌ 错误: 未找到npm，请确保npm已正确安装"
    exit 1
fi

echo "✅ Node.js版本: $(node --version)"
echo "✅ npm版本: $(npm --version)"
echo ""

# 安装依赖
echo "📦 安装依赖..."
npm install

if [ $? -eq 0 ]; then
    echo "✅ 依赖安装成功"
else
    echo "❌ 依赖安装失败"
    exit 1
fi

# 编译TypeScript
echo "🔨 编译TypeScript..."
npm run compile

if [ $? -eq 0 ]; then
    echo "✅ 编译成功"
else
    echo "❌ 编译失败"
    exit 1
fi

echo ""
echo "🎉 安装完成！"
echo ""
echo "📖 使用说明:"
echo "1. 在VSCode中按 Ctrl+Shift+P 打开命令面板"
echo "2. 输入 'Extensions: Install from VSIX'"
echo "3. 选择生成的 .vsix 文件进行安装"
echo ""
echo "或者运行以下命令打包插件:"
echo "npm run package" 