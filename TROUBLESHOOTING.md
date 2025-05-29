# 故障排除指南

## 🔍 侧边栏图标不显示的解决方案

### 问题描述
安装插件后，在Cursor的侧边栏（活动栏）中找不到Git Log Explorer图标。

### 🛠️ 解决步骤

#### 1. 检查插件是否正确安装
```bash
# 确保编译成功
npm run compile

# 检查输出目录
ls -la out/
```

#### 2. 重新启动调试会话
1. 在Cursor中，如果正在调试，按 `Ctrl+Shift+F5` 重启调试会话
2. 或者关闭调试窗口，重新按 `F5` 启动调试

#### 3. 检查插件激活状态
1. 在调试窗口中，按 `Ctrl+Shift+P` 打开命令面板
2. 输入 `Developer: Show Running Extensions`
3. 查看是否有 "Cursor Git Log Explorer" 插件

#### 4. 强制激活插件
在调试窗口中按 `Ctrl+Shift+P`，输入以下命令之一：
- `Git Log Explorer: Refresh`
- `workbench.view.extension.git-log-explorer`

#### 5. 检查工作区
确保你在调试窗口中打开了一个包含Git仓库的项目：
```bash
# 在项目目录中检查
git status
```

### 🎯 验证步骤

#### 方法1: 查找活动栏图标
- 在Cursor左侧活动栏中寻找Git分支图标
- 图标应该显示为 `$(git-branch)` 样式
- 鼠标悬停应该显示 "Git Log Explorer"

#### 方法2: 通过命令面板访问
1. 按 `Ctrl+Shift+P`
2. 输入 "Git Log Explorer"
3. 应该能看到相关命令

#### 方法3: 检查视图菜单
1. 菜单栏 -> View -> Open View
2. 搜索 "Git Log Explorer"

### 🔧 高级故障排除

#### 清理和重建
```bash
# 清理编译文件
rm -rf out/
rm -rf node_modules/

# 重新安装和编译
npm install
npm run compile
```

#### 检查日志
1. 在调试窗口中按 `Ctrl+Shift+U` 打开输出面板
2. 在下拉菜单中选择 "Extension Host"
3. 查找任何错误信息

#### 手动激活
在调试窗口的控制台中运行：
```javascript
// 按 F12 打开开发者工具，在控制台中输入：
vscode.commands.executeCommand('gitLogExplorer.refresh');
```

### 📋 常见问题解答

**Q: 图标在哪里显示？**
A: 图标会显示在Cursor左侧的活动栏中，通常在资源管理器图标的下方。

**Q: 为什么插件没有自动激活？**
A: 插件只在检测到Git仓库时才会激活。确保你打开的项目包含 `.git` 文件夹。

**Q: 可以手动激活插件吗？**
A: 可以通过命令面板执行 `Git Log Explorer: Refresh` 命令来手动激活。

**Q: 如果还是不显示怎么办？**
A: 
1. 确保使用的是最新的配置（已修复视图容器问题）
2. 重新编译：`npm run compile`
3. 重启调试会话
4. 检查Cursor版本是否支持（需要1.74.0+）

### 🚀 成功标志

当插件正确安装并激活后，你应该能看到：
1. 侧边栏有Git分支图标
2. 点击图标后显示Git Log Explorer面板
3. 面板中有刷新、切换分支等按钮
4. 如果是Git仓库，会显示提交历史

### 📞 获取帮助

如果按照以上步骤仍然无法解决问题，请：
1. 检查控制台是否有错误信息
2. 确保Node.js和npm版本兼容
3. 尝试在一个简单的Git仓库中测试
4. 查看 `package.json` 中的配置是否正确 