# 更新日志

## v1.2.0 - 重大问题修复版本 🚀

### 🎯 主要修复

#### 1. 插件初始化问题完全解决
- **问题**: 插件启动后不显示Git日志，需要手动刷新
- **修复**: 
  - 添加延迟初始化机制（100ms），确保VSCode环境准备完毕
  - 改进异步加载流程，自动触发UI更新
  - 添加加载状态指示："正在加载Git数据..."
- **结果**: 插件启动后立即显示当前分支的完整Git日志

#### 2. 筛选界面重新设计
- **问题**: 筛选功能隐藏在顶部命令中，用户体验差
- **修复**: 
  - 创建专门的"📋 筛选控制面板"，默认展开
  - 所有筛选选项直接显示在主边栏中
  - 筛选状态实时显示，无需猜测当前筛选条件
- **新界面布局**:
  ```
  📋 筛选控制面板
  ├── 🌿 分支/标签: main
  ├── 👤 作者筛选: [当前筛选条件]
  ├── 💬 消息筛选: [当前筛选条件]
  ├── 🗑️ 清除所有筛选 (有筛选时显示)
  ├── ⚖️ 比较模式: branch1 → branch2 (比较时显示)
  ├── ──────────────────────
  ├── abc12345 - John Doe
  │   2023-12-01: Add new feature
  └── ...
  ```

### ✨ 新增功能

#### 1. 智能筛选控件
- `InputItem` 类：专门用于显示筛选输入项
- 动态显示当前值和占位符提示
- 点击直接触发对应的筛选操作

#### 2. 增强的命令系统
- `gitLogExplorer.showBranchPicker` - 显示分支选择器
- `gitLogExplorer.setAuthorFilter` - 设置作者筛选
- `gitLogExplorer.setMessageFilter` - 设置消息筛选
- `gitLogExplorer.clearFilters` - 清除所有筛选

#### 3. 改进的状态管理
- `isInitialized` 状态跟踪，防止重复初始化
- 筛选条件变化时自动更新UI
- 更好的错误处理和用户反馈

### 🔧 技术改进

#### 1. TypeScript类型系统优化
```typescript
// 支持混合类型的树视图
export class GitLogProvider implements vscode.TreeDataProvider<GitLogItem | FilterItem | InputItem>

// 新的输入控件类
export class InputItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly contextValue: string,
        public readonly placeholder: string = '',
        public readonly value: string = ''
    )
}
```

#### 2. 异步初始化流程
```typescript
constructor(private gitService: GitService) {
    // 延迟初始化，确保VSCode环境准备好
    setTimeout(() => this.initializeData(), 100);
}

private async initializeData(): Promise<void> {
    // 完整的初始化流程
    // 自动加载分支、标签和提交历史
    // 设置初始化完成标志
    // 触发UI更新
}
```

#### 3. 智能UI更新机制
```typescript
async setAuthorFilter(): Promise<void> {
    // 获取用户输入
    // 更新筛选条件
    await this.loadCommits();          // 重新加载数据
    this._onDidChangeTreeData.fire();  // 立即更新UI
}
```

### 🎨 用户体验改进

#### 1. 视觉层次优化
- 使用表情符号图标增强可读性
- 筛选控制面板有专门的齿轮图标
- 清晰的分隔线和层次结构

#### 2. 交互流程优化
- 点击任意筛选项立即响应
- 筛选状态实时可见
- 无需在多个菜单间切换

#### 3. 加载状态指示
- 显示"正在加载Git数据..."
- 防止用户在未加载完成时操作
- 更好的错误提示

### 📋 兼容性保证

所有原有命令完全兼容：
- `gitLogExplorer.switchBranch` → 调用新的 `showBranchPicker`
- `gitLogExplorer.filterAuthor` → 调用新的 `setAuthorFilter`
- `gitLogExplorer.filterMessage` → 调用新的 `setMessageFilter`

### 🚀 性能优化

- 减少不必要的Git操作
- 缓存分支和标签列表
- 智能的UI更新策略

### 📝 已知限制和后续计划

#### 当前版本限制
1. 筛选输入仍使用弹出对话框（InputBox）
2. 分支选择使用QuickPick（设计决策，因为分支可能很多）

#### 后续版本计划
1. **v1.3.0**: 真正的内嵌输入控件（WebView + 表单）
2. **v1.4.0**: 筛选历史记录和快速筛选
3. **v1.5.0**: 正则表达式和日期范围筛选

---

## v1.1.0 - 问题修复版本

### 🐛 修复的问题

#### 1. 侧边栏图标显示问题
- **问题**: 插件安装后侧边栏不显示图标
- **修复**: 重新配置了`package.json`中的视图容器，将视图正确关联到活动栏
- **影响**: 现在插件图标会正确显示在Cursor左侧活动栏中

#### 2. Git作者筛选报错
- **问题**: 使用作者筛选时出现"ambiguous argument"错误
- **原因**: simple-git库的author选项格式不正确
- **修复**: 
  - 重写了`filterCommits`方法，使用`git.raw()`直接执行git命令
  - 添加了回退机制，如果raw命令失败会使用手动筛选
  - 改进了错误处理，提供更友好的用户体验

#### 3. Git日志显示格式改进
- **问题**: 所有信息挤在一行，无法完全查看提交说明
- **修复**: 
  - **第一行**: 显示短提交ID和作者名称
  - **第二行**: 显示日期和完整提交说明
  - 添加了详细的tooltip提示信息

#### 4. 筛选功能用户体验改进
- **问题**: 筛选条件只能通过顶部命令访问，不够直观
- **修复**: 
  - 在主边栏添加了专门的筛选控件
  - 筛选状态实时显示在界面中
  - 可以分别筛选作者和提交消息
  - 添加了"退出比较模式"功能

### ✨ 新增功能

#### 1. 内嵌筛选控件
- `分支/标签: [当前分支]` - 点击切换分支或标签
- `作者筛选: [筛选条件]` - 点击设置作者筛选
- `消息筛选: [筛选条件]` - 点击设置消息筛选
- `比较模式: [分支A] → [分支B]` - 显示比较状态，点击退出

#### 2. 改进的默认行为
- 插件启动时自动显示当前Git分支的日志
- 自动检测Git仓库并初始化数据
- 更好的错误处理和用户反馈

#### 3. 新增命令
- `gitLogExplorer.filterAuthor` - 筛选作者
- `gitLogExplorer.filterMessage` - 筛选提交消息
- `gitLogExplorer.exitCompareMode` - 退出比较模式

### 🔧 技术改进

#### 1. Git操作优化
```typescript
// 新的筛选实现，更稳定可靠
public async filterCommits(branchOrTag: string, authorFilter?: string, messageFilter?: string): Promise<GitCommit[]> {
    // 使用git.raw()直接执行命令
    const args = ['--format=fuller', `--author=${authorFilter}`, branchOrTag];
    const result = await this.git.raw(args);
    
    // 手动解析git log输出
    // 添加回退机制
}
```

#### 2. UI组件重构
```typescript
// 新的筛选控件类
export class FilterItem extends vscode.TreeItem {
    constructor(label: string, contextValue: string, command?: vscode.Command) {
        // 专门用于显示筛选控件
    }
}

// 改进的提供者支持混合内容
export class GitLogProvider implements vscode.TreeDataProvider<GitLogItem | FilterItem> {
    // 同时支持筛选控件和提交项
}
```

#### 3. 初始化流程优化
```typescript
constructor(private gitService: GitService) {
    this.initializeData(); // 自动初始化
}

private async initializeData(): Promise<void> {
    // 自动检测Git仓库
    // 获取当前分支
    // 加载分支和标签列表
    // 加载提交历史
}
```

### 📋 使用指南更新

#### 新的界面布局
```
Git Log Explorer
├── 分支/标签: main                    [点击切换]
├── 作者筛选: 点击筛选作者               [点击设置]
├── 消息筛选: 点击筛选提交消息           [点击设置]
├── ─────────────────                  [分隔线]
├── abc12345 - John Doe               [提交项]
│   2023-12-01: Add new feature
├── def67890 - Jane Smith
│   2023-11-30: Fix bug in login
└── ...
```

#### 筛选功能使用
1. **作者筛选**: 点击"作者筛选"行，输入作者名称或邮箱
2. **消息筛选**: 点击"消息筛选"行，输入关键字
3. **清除筛选**: 输入空值即可清除对应筛选条件
4. **组合筛选**: 可以同时设置作者和消息筛选

#### 分支比较功能
1. 使用工具栏的比较按钮选择两个分支
2. 界面会显示"比较模式: branch1 → branch2"
3. 点击比较模式行可以退出比较模式

### 🚀 升级说明

1. **重新编译**: `npm run compile`
2. **重启调试**: 按`Ctrl+Shift+F5`重启调试会话
3. **验证功能**: 在Git仓库中测试所有新功能

### 🐛 已知问题

暂无已知问题

### 📞 反馈

如果遇到任何问题，请检查：
1. 确保在Git仓库中使用
2. 检查控制台错误信息
3. 尝试重新编译和重启调试会话 

## [2.3.0] - 2024-12-19

### 🎉 重大改进
- **分支比较功能重构**: 解决了remote-ssh环境中面板视图兼容性问题
- **新的比较显示方式**: 分支比较结果现在在代码编辑器窗口中显示，类似文件diff
- **完整commit ID显示**: 按用户要求显示完整的commit ID而不是缩短版本
- **智能差异过滤**: 自动隐藏相同的提交记录，只显示有差异的内容

### ✨ 新功能
- 添加`getBranchDifference`方法，智能比较两个分支的差异
- 新增测试命令`gitLogExplorer.testCompare`用于快速测试分支比较功能
- 优化的比较内容格式，包含统计信息和详细差异

### 🔧 技术改进
- 重构`webviewProvider.ts`，移除了错误的HTML代码插入
- 简化比较流程，直接在代码窗口显示结果
- 改进错误处理和用户反馈

### 🐛 问题修复
- 修复了remote-ssh环境中面板视图无法创建的问题
- 解决了"_view 不存在"的错误
- 清理了重复和错误的代码片段

### 📝 用户体验改进
- 分支比较结果现在以清晰的格式显示在编辑器中
- 支持语法高亮（git-commit格式）
- 更好的错误提示和用户指导

## [2.2.0] - 2024-12-19 