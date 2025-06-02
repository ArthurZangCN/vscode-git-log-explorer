# Git Log Explorer VSCode 插件

一个功能强大的Git日志管理插件，支持分支切换、提交筛选、文件差异查看和高级Git操作。

## 🎯 当前状态 (v1.0.0)

✅ **核心功能已完成**：
- 🌿 分支切换和查看
- 📊 提交历史显示
- 👤 作者筛选
- 💬 提交消息筛选 
- ⚖️ 分支比较
- 📄 提交详情查看
- 🔄 远程数据刷新

✅ **新增高级功能后端逻辑100%完成**：
1. **📦 Stash管理** - 完整的stash创建、应用、删除功能
2. **🔄 Rebase功能** - 支持交互式和常规rebase
3. **⚠️ 强制重置** - 重置到远程分支，丢弃本地更改
4. **🍒 Cherry-pick** - 从其他分支选择性合并提交
5. **➕ 创建分支** - 从指定基础分支创建新分支
6. **🗑️ 删除分支** - 批量删除本地/远程分支

⚠️ **UI界面状态**：
- 基础UI完成，6个新功能按钮已添加（仅在本地分支显示）
- 当前使用简单弹窗提示，复杂模态框UI开发中

## 🚀 安装和使用

### 安装
1. 克隆项目到本地
2. 运行 `npm install` 安装依赖
3. 运行 `npm run compile` 编译代码
4. 在VSCode中按F5启动调试，或运行 `npm run build-vsix` 生成.vsix包安装

### 使用
1. 打开任意Git仓库
2. 在侧边栏找到 "Git Log Explorer" 图标
3. 选择分支查看提交历史
4. 使用筛选功能过滤结果
5. 在本地分支时可使用高级功能

## 🛠️ 技术架构

### 核心服务
- **GitService**: 完整的Git操作封装，支持所有常用和高级Git命令
- **WebviewProvider**: 主界面提供者，处理用户交互
- **GitLogProvider**: Tree View提供者（保留兼容性）

### 已实现的Git操作
```typescript
// Stash管理
getStashList(), createStash(), applyStash(), dropStash()

// 分支操作
createBranch(), deleteLocalBranch(), deleteRemoteBranch()

// Rebase和重置
rebaseOnto(), abortRebase(), resetToRemote()

// Cherry-pick
cherryPick(), cherryPickMultiple()

// 安全检查
getWorkingDirectoryStatus(), branchExists()
```

## 🔧 开发说明

当前版本已完成所有后端逻辑，包括：
- ✅ 完整的错误处理和用户提示
- ✅ 危险操作的安全确认
- ✅ 工作区状态检查
- ✅ 权限控制（本地分支限制）

下一步开发重点：
1. 完善高级功能的UI界面
2. 添加更多用户交互选项
3. 性能优化和错误处理改进

## 📝 更新日志

### v1.0.0 (当前版本)
- 🎉 完成所有6个高级功能的后端实现
- 🔧 修复分支选择功能，恢复下拉选择框
- 🎨 添加分支类型分组显示（本地/远程/标签）
- 🛡️ 增强安全性和错误处理
- 📊 添加详细的调试日志

### 特性
- 支持本地和远程分支显示
- 智能选择最新版本（本地vs远程）
- 完整的标签支持
- 危险操作前用户确认
- 实时状态反馈

## 🤝 贡献

欢迎提交Issues和Pull Requests来改进这个插件！

## �� 许可证

MIT License 