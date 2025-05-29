# 🔧 插件激活测试指南

## 🚨 当前问题
插件没有被激活，控制台没有看到激活日志。

## 📦 测试版本
已创建简化测试版本 `cursor-git-log-explorer-1.0.2.vsix`

### 简化内容：
- ✅ 移除所有复杂的WebView和面板配置
- ✅ 只保留基本的激活函数和一个测试命令
- ✅ 使用 `activationEvents: ["*"]` 强制激活
- ✅ 添加明显的控制台日志和弹窗提示

## 🛠️ 安装测试步骤

### 步骤1: 卸载旧版本
1. 打开VSCode/Cursor
2. 按 `Ctrl+Shift+P` 打开命令面板
3. 输入 "Extensions: Show Installed Extensions"
4. 找到 "Cursor Git Log Explorer" 并卸载

### 步骤2: 安装新版本
1. 在VSCode/Cursor中按 `Ctrl+Shift+P`
2. 输入 "Extensions: Install from VSIX..."
3. 选择 `cursor-git-log-explorer-1.0.2.vsix` 文件
4. 重启VSCode/Cursor

### 步骤3: 验证激活
安装后应该立即看到：
- 🎉 弹窗消息："Git Log Explorer 插件已激活！"
- 📝 控制台日志：
  ```
  🚀🚀🚀 Git Log Explorer 插件开始激活... 🚀🚀🚀
  📍 当前工作目录: /path/to/workspace
  📍 插件路径: /path/to/extension
  📍 VSCode版本: x.x.x
  ✅✅✅ Git Log Explorer 插件激活完成！✅✅✅
  ```

### 步骤4: 测试命令
1. 按 `Ctrl+Shift+P` 打开命令面板
2. 输入 "Git Log Explorer: 测试命令"
3. 应该看到弹窗："✅ 测试命令工作正常！"

## 🔍 如果仍然没有激活

### 检查1: 插件是否安装
1. 打开扩展面板 (`Ctrl+Shift+X`)
2. 搜索 "cursor git"
3. 确认插件已安装且启用

### 检查2: 开发者工具
1. 按 `F12` 或 `Ctrl+Shift+I` 打开开发者工具
2. 查看 Console 标签页
3. 寻找插件相关的日志

### 检查3: 扩展主机日志
1. 按 `Ctrl+Shift+P`
2. 输入 "Developer: Show Running Extensions"
3. 查看插件是否在运行列表中

## 🚀 如果测试版本工作正常
确认简化版本能激活后，我们将逐步恢复完整功能：
1. ✅ 基本激活 (当前测试)
2. 🔄 添加WebView视图
3. 🔄 添加Git服务
4. 🔄 添加比较面板
5. 🔄 完整功能恢复

## 📞 反馈信息
请提供以下信息：
1. 是否看到激活弹窗？
2. 控制台是否有激活日志？
3. 测试命令是否工作？
4. 插件是否出现在扩展列表中？ 