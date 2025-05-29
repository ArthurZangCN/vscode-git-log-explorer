"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitLogProvider = exports.InputItem = exports.FilterItem = exports.GitLogItem = void 0;
const vscode = require("vscode");
const path = require("path");
class GitLogItem extends vscode.TreeItem {
    constructor(label, collapsibleState, contextValue, command, commit, filePath) {
        super(label, collapsibleState);
        this.label = label;
        this.collapsibleState = collapsibleState;
        this.contextValue = contextValue;
        this.command = command;
        this.commit = commit;
        this.filePath = filePath;
        this.contextValue = contextValue;
        this.command = command;
    }
}
exports.GitLogItem = GitLogItem;
// 筛选控件项
class FilterItem extends vscode.TreeItem {
    constructor(label, contextValue, command) {
        super(label, vscode.TreeItemCollapsibleState.Expanded);
        this.label = label;
        this.contextValue = contextValue;
        this.command = command;
        this.contextValue = contextValue;
        this.command = command;
    }
}
exports.FilterItem = FilterItem;
// 输入框控件
class InputItem extends vscode.TreeItem {
    constructor(label, contextValue, placeholder = '', value = '') {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.label = label;
        this.contextValue = contextValue;
        this.placeholder = placeholder;
        this.value = value;
        this.contextValue = contextValue;
        this.description = value || placeholder;
    }
}
exports.InputItem = InputItem;
class GitLogProvider {
    constructor(gitService) {
        this.gitService = gitService;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.commits = [];
        this.currentBranch = '';
        this.authorFilter = '';
        this.messageFilter = '';
        this.isCompareMode = false;
        this.compareInfo = { from: '', to: '' };
        this.branches = [];
        this.tags = [];
        this.isInitialized = false;
        // 延迟初始化，确保VSCode环境准备好
        setTimeout(() => this.initializeData(), 100);
    }
    async initializeData() {
        try {
            const isGitRepo = await this.gitService.isGitRepository();
            if (isGitRepo) {
                this.currentBranch = await this.gitService.getCurrentBranch();
                this.branches = await this.gitService.getBranches();
                this.tags = await this.gitService.getTags();
                await this.loadCommits();
                this.isInitialized = true;
                this._onDidChangeTreeData.fire();
            }
        }
        catch (error) {
            console.error('Failed to initialize data:', error);
            vscode.window.showErrorMessage(`初始化Git数据失败: ${error}`);
        }
    }
    refresh() {
        this.initializeData();
    }
    getTreeItem(element) {
        return element;
    }
    async getChildren(element) {
        if (!element) {
            // 根级别 - 显示筛选控件和提交列表
            const items = [];
            if (!this.isInitialized) {
                return [new FilterItem('正在加载Git数据...', 'loading')];
            }
            // 紧凑的筛选控件 - 合并到一行
            const filterStatus = this.getFilterStatusText();
            const filterControl = new InputItem(`📋 ${filterStatus}`, 'filter-control', '点击配置筛选条件', '');
            filterControl.command = {
                command: 'gitLogExplorer.showFilterMenu',
                title: 'Show Filter Menu'
            };
            items.push(filterControl);
            // 比较模式状态（如果存在）
            if (this.isCompareMode) {
                const compareStatus = new InputItem(`⚖️ 比较模式: ${this.compareInfo.from} → ${this.compareInfo.to}`, 'compare-status', '点击退出比较模式', '');
                compareStatus.command = {
                    command: 'gitLogExplorer.exitCompareMode',
                    title: 'Exit Compare Mode'
                };
                items.push(compareStatus);
            }
            // 分隔线
            items.push(new FilterItem('──────────────────────', 'separator'));
            // 提交列表 - 确保加载
            const commitItems = await this.getCommitItems();
            items.push(...commitItems);
            return items;
        }
        else if (element.contextValue === 'commit') {
            // 展开提交 - 显示文件列表
            return this.getCommitFileItems(element.commit);
        }
        return [];
    }
    getFilterStatusText() {
        const parts = [];
        // 分支/标签
        parts.push(`分支: ${this.currentBranch}`);
        // 筛选条件
        const filters = [];
        if (this.authorFilter) {
            filters.push(`作者: ${this.authorFilter}`);
        }
        if (this.messageFilter) {
            filters.push(`消息: ${this.messageFilter}`);
        }
        if (filters.length > 0) {
            parts.push(`筛选: ${filters.join(', ')}`);
        }
        return parts.join(' | ');
    }
    async loadCommits() {
        try {
            const isGitRepo = await this.gitService.isGitRepository();
            if (!isGitRepo) {
                this.commits = [];
                return;
            }
            if (this.isCompareMode && this.compareInfo.from && this.compareInfo.to) {
                this.commits = await this.gitService.compareCommits(this.compareInfo.from, this.compareInfo.to);
            }
            else {
                if (!this.currentBranch) {
                    this.currentBranch = await this.gitService.getCurrentBranch();
                }
                if (this.authorFilter || this.messageFilter) {
                    this.commits = await this.gitService.filterCommits(this.currentBranch, this.authorFilter, this.messageFilter);
                }
                else {
                    this.commits = await this.gitService.getCommits(this.currentBranch);
                }
            }
        }
        catch (error) {
            vscode.window.showErrorMessage(`加载提交历史失败: ${error}`);
            this.commits = [];
        }
    }
    async getCommitItems() {
        // 确保提交数据已加载
        if (this.commits.length === 0) {
            await this.loadCommits();
        }
        return this.commits.map(commit => {
            const shortHash = commit.hash.substring(0, 8);
            const date = new Date(commit.date).toLocaleDateString();
            // 处理作者名称 - 只取名字部分，不要邮箱
            let authorName = commit.author;
            const emailMatch = commit.author.match(/^(.+?)\s*<.*>$/);
            if (emailMatch) {
                authorName = emailMatch[1].trim();
            }
            // 第一行：短commit ID和作者名
            const label = `${shortHash} - ${authorName}`;
            // 第二行：日期和提交说明
            const description = `${date}: ${commit.message}`;
            const item = new GitLogItem(label, vscode.TreeItemCollapsibleState.Collapsed, 'commit', undefined, commit);
            item.description = description;
            item.iconPath = new vscode.ThemeIcon('git-commit');
            item.tooltip = `提交: ${commit.hash}\n作者: ${commit.author}\n日期: ${date}\n消息: ${commit.message}`;
            return item;
        });
    }
    async getCommitFileItems(commit) {
        try {
            const files = await this.gitService.getCommitFiles(commit.hash);
            return files.map(filePath => {
                const fileName = path.basename(filePath);
                const item = new GitLogItem(fileName, vscode.TreeItemCollapsibleState.None, 'file', {
                    command: 'gitLogExplorer.showCommitDiff',
                    title: 'Show Diff',
                    arguments: [{ commit, filePath }]
                }, commit, filePath);
                item.description = filePath;
                item.iconPath = vscode.ThemeIcon.File;
                item.tooltip = `双击查看 ${filePath} 的差异`;
                return item;
            });
        }
        catch (error) {
            vscode.window.showErrorMessage(`加载提交文件失败: ${error}`);
            return [];
        }
    }
    // 新的筛选方法 - 显示分支选择器
    async showBranchPicker() {
        try {
            const items = [
                ...this.branches.map(branch => ({
                    label: branch.name,
                    description: branch.current ? '(当前)' : '',
                    detail: `分支 - ${branch.type}`
                })),
                ...this.tags.map(tag => ({
                    label: tag.name,
                    description: tag.hash.substring(0, 8),
                    detail: '标签'
                }))
            ];
            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: '选择分支或标签'
            });
            if (selected) {
                this.currentBranch = selected.label;
                this.isCompareMode = false;
                await this.loadCommits();
                this._onDidChangeTreeData.fire();
            }
        }
        catch (error) {
            vscode.window.showErrorMessage(`切换分支失败: ${error}`);
        }
    }
    // 设置作者筛选
    async setAuthorFilter() {
        const authorInput = await vscode.window.showInputBox({
            prompt: '输入作者名称进行筛选 (留空表示清除筛选)',
            value: this.authorFilter,
            placeHolder: '例如: John Doe 或 john@example.com'
        });
        if (authorInput !== undefined) {
            this.authorFilter = authorInput.trim();
            await this.loadCommits();
            this._onDidChangeTreeData.fire();
        }
    }
    // 设置消息筛选
    async setMessageFilter() {
        const messageInput = await vscode.window.showInputBox({
            prompt: '输入提交信息关键字进行筛选 (留空表示清除筛选)',
            value: this.messageFilter,
            placeHolder: '例如: fix bug 或 feature'
        });
        if (messageInput !== undefined) {
            this.messageFilter = messageInput.trim();
            await this.loadCommits();
            this._onDidChangeTreeData.fire();
        }
    }
    // 清除所有筛选
    async clearFilters() {
        this.authorFilter = '';
        this.messageFilter = '';
        await this.loadCommits();
        this._onDidChangeTreeData.fire();
    }
    // 兼容性方法
    async switchBranch() {
        await this.showBranchPicker();
    }
    async filterAuthor() {
        await this.setAuthorFilter();
    }
    async filterMessage() {
        await this.setMessageFilter();
    }
    async filterCommits() {
        await this.setAuthorFilter();
    }
    async compareBranchesMethod() {
        try {
            const items = [
                ...this.branches.map(branch => ({
                    label: branch.name,
                    description: branch.current ? '(当前)' : '',
                    detail: `分支 - ${branch.type}`
                })),
                ...this.tags.map(tag => ({
                    label: tag.name,
                    description: tag.hash.substring(0, 8),
                    detail: '标签'
                }))
            ];
            const fromBranch = await vscode.window.showQuickPick(items, {
                placeHolder: '选择起始分支或标签'
            });
            if (!fromBranch)
                return;
            const toBranch = await vscode.window.showQuickPick(items, {
                placeHolder: '选择结束分支或标签'
            });
            if (!toBranch)
                return;
            // 获取分支差异并在编辑器中显示
            await this.showBranchComparisonInEditor(fromBranch.label, toBranch.label);
        }
        catch (error) {
            vscode.window.showErrorMessage(`比较分支失败: ${error}`);
        }
    }
    async showBranchComparisonInEditor(fromBranch, toBranch) {
        try {
            console.log(`🔄 开始比较分支: ${fromBranch} vs ${toBranch}`);
            // 获取分支差异
            const difference = await this.gitService.getBranchDifference(fromBranch, toBranch);
            // 生成比较内容
            const comparisonContent = this.generateBranchComparisonContent(fromBranch, toBranch, difference);
            // 在新的编辑器窗口中显示比较结果
            const document = await vscode.workspace.openTextDocument({
                content: comparisonContent,
                language: 'git-commit' // 使用git-commit语法高亮
            });
            await vscode.window.showTextDocument(document, {
                preview: false,
                viewColumn: vscode.ViewColumn.Beside
            });
            vscode.window.showInformationMessage(`✅ 分支比较完成: ${fromBranch} ↔ ${toBranch}`);
        }
        catch (error) {
            console.error('❌ 分支比较失败:', error);
            vscode.window.showErrorMessage(`分支比较失败: ${error}`);
        }
    }
    generateBranchComparisonContent(fromBranch, toBranch, difference) {
        const lines = [];
        // 标题
        lines.push(`Git 分支比较: ${fromBranch} ↔ ${toBranch}`);
        lines.push('='.repeat(60));
        lines.push('');
        // 统计信息
        lines.push(`📊 比较统计:`);
        lines.push(`   • 仅在 ${fromBranch} 中: ${difference.onlyInFrom.length} 个提交`);
        lines.push(`   • 仅在 ${toBranch} 中: ${difference.onlyInTo.length} 个提交`);
        lines.push(`   • 提交说明不同: ${difference.different.length} 个提交`);
        lines.push('');
        // 仅在源分支中的提交（显示完整commit id）
        if (difference.onlyInFrom.length > 0) {
            lines.push(`🔴 仅在 ${fromBranch} 中的提交:`);
            lines.push('-'.repeat(40));
            for (const commit of difference.onlyInFrom) {
                lines.push(`${commit.hash} - ${commit.author.replace(/<.*>/, '').trim()}`);
                lines.push(`    ${commit.message}`);
                lines.push('');
            }
        }
        // 仅在目标分支中的提交（显示完整commit id）
        if (difference.onlyInTo.length > 0) {
            lines.push(`🟢 仅在 ${toBranch} 中的提交:`);
            lines.push('-'.repeat(40));
            for (const commit of difference.onlyInTo) {
                lines.push(`${commit.hash} - ${commit.author.replace(/<.*>/, '').trim()}`);
                lines.push(`    ${commit.message}`);
                lines.push('');
            }
        }
        // 只显示提交说明不同的记录（显示完整commit id）
        if (difference.different.length > 0) {
            lines.push(`🔄 提交说明不同的记录:`);
            lines.push('-'.repeat(40));
            for (const diff of difference.different) {
                lines.push(`${diff.hash} - ${diff.author.replace(/<.*>/, '').trim()}`);
                lines.push(`    ${fromBranch}: ${diff.fromMessage}`);
                lines.push(`    ${toBranch}: ${diff.toMessage}`);
                lines.push('');
            }
        }
        // 如果没有差异
        if (difference.onlyInFrom.length === 0 &&
            difference.onlyInTo.length === 0 &&
            difference.different.length === 0) {
            lines.push('✅ 两个分支没有差异');
        }
        lines.push('');
        lines.push(`生成时间: ${new Date().toLocaleString('zh-CN')}`);
        return lines.join('\n');
    }
    async exitCompareMode() {
        this.isCompareMode = false;
        this.compareInfo = { from: '', to: '' };
        await this.loadCommits();
        this._onDidChangeTreeData.fire();
    }
    async interactiveRebase() {
        const selected = await vscode.window.showInformationMessage('交互式变基功能', '此功能允许您选择多个提交进行合并或重新排序。请在树视图中选择多个提交，然后使用此功能。', '了解');
        if (selected) {
            vscode.window.showInformationMessage('使用方法：\n1. 在树视图中按住Ctrl键选择多个提交\n2. 右键选择"Interactive Rebase"\n3. 选择操作类型（合并、重新排序等）');
        }
    }
    async showCommitDiff(item) {
        if (!item || !item.commit) {
            return;
        }
        const commit = item.commit;
        const filePath = item.filePath;
        try {
            if (filePath) {
                // 显示特定文件的差异
                await this.showFileDiff(commit, filePath);
            }
            else {
                // 显示整个提交的差异
                await this.showCommitDiffPanel(commit);
            }
        }
        catch (error) {
            vscode.window.showErrorMessage(`显示差异失败: ${error}`);
        }
    }
    async showFileDiff(commit, filePath) {
        try {
            // 获取提交前后的文件内容
            const beforeContent = await this.getFileContentBefore(commit.hash, filePath);
            const afterContent = await this.gitService.getFileContent(commit.hash, filePath);
            // 创建临时文件用于比较
            const beforeUri = vscode.Uri.parse(`git-before:${commit.hash}~1:${filePath}`);
            const afterUri = vscode.Uri.parse(`git-after:${commit.hash}:${filePath}`);
            // 注册虚拟文档提供者
            const beforeProvider = new class {
                provideTextDocumentContent() {
                    return beforeContent;
                }
            };
            const afterProvider = new class {
                provideTextDocumentContent() {
                    return afterContent;
                }
            };
            vscode.workspace.registerTextDocumentContentProvider('git-before', beforeProvider);
            vscode.workspace.registerTextDocumentContentProvider('git-after', afterProvider);
            // 打开差异比较
            await vscode.commands.executeCommand('vscode.diff', beforeUri, afterUri, `${path.basename(filePath)} (${commit.hash.substring(0, 8)})`);
        }
        catch (error) {
            vscode.window.showErrorMessage(`显示文件差异失败: ${error}`);
        }
    }
    async getFileContentBefore(commitHash, filePath) {
        try {
            return await this.gitService.getFileContent(`${commitHash}~1`, filePath);
        }
        catch (error) {
            return '';
        }
    }
    async showCommitDiffPanel(commit) {
        const diff = await this.gitService.getCommitDiff(commit.hash);
        const panel = vscode.window.createWebviewPanel('gitCommitDiff', `提交差异 - ${commit.hash.substring(0, 8)}`, vscode.ViewColumn.Beside, {
            enableScripts: true,
            retainContextWhenHidden: true
        });
        panel.webview.html = this.getCommitDiffHtml(commit, diff);
    }
    getCommitDiffHtml(commit, diff) {
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>提交差异</title>
            <style>
                body {
                    font-family: 'Consolas', 'Monaco', monospace;
                    line-height: 1.4;
                    margin: 0;
                    padding: 20px;
                    background-color: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                }
                .commit-header {
                    border-bottom: 1px solid var(--vscode-panel-border);
                    padding-bottom: 15px;
                    margin-bottom: 20px;
                }
                .commit-hash {
                    font-size: 16px;
                    font-weight: bold;
                    color: var(--vscode-textLink-foreground);
                }
                .commit-author {
                    margin-top: 5px;
                    color: var(--vscode-descriptionForeground);
                }
                .commit-message {
                    margin-top: 10px;
                    font-style: italic;
                }
                .diff-content {
                    white-space: pre-wrap;
                    font-size: 12px;
                    background-color: var(--vscode-textCodeBlock-background);
                    padding: 15px;
                    border-radius: 3px;
                    overflow-x: auto;
                }
                .line-added {
                    background-color: rgba(0, 255, 0, 0.1);
                    color: #4CAF50;
                }
                .line-removed {
                    background-color: rgba(255, 0, 0, 0.1);
                    color: #F44336;
                }
                .line-context {
                    color: var(--vscode-editor-foreground);
                }
            </style>
        </head>
        <body>
            <div class="commit-header">
                <div class="commit-hash">提交: ${commit.hash}</div>
                <div class="commit-author">作者: ${commit.author}</div>
                <div class="commit-message">提交信息: ${commit.message}</div>
            </div>
            <div class="diff-content">${this.formatDiff(diff)}</div>
        </body>
        </html>
        `;
    }
    formatDiff(diff) {
        return diff
            .split('\n')
            .map(line => {
            if (line.startsWith('+')) {
                return `<div class="line-added">${this.escapeHtml(line)}</div>`;
            }
            else if (line.startsWith('-')) {
                return `<div class="line-removed">${this.escapeHtml(line)}</div>`;
            }
            else {
                return `<div class="line-context">${this.escapeHtml(line)}</div>`;
            }
        })
            .join('');
    }
    escapeHtml(text) {
        return text.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    // 显示筛选菜单
    async showFilterMenu() {
        const options = [
            {
                label: '🌿 切换分支/标签',
                description: `当前: ${this.currentBranch}`,
                detail: '选择不同的分支或标签查看其提交历史'
            },
            {
                label: '👤 筛选作者',
                description: this.authorFilter ? `当前: ${this.authorFilter}` : '未设置',
                detail: '按作者名称或邮箱筛选提交'
            },
            {
                label: '💬 筛选消息',
                description: this.messageFilter ? `当前: ${this.messageFilter}` : '未设置',
                detail: '按提交消息关键字筛选'
            }
        ];
        // 如果有筛选条件，添加清除选项
        if (this.authorFilter || this.messageFilter) {
            options.push({
                label: '🗑️ 清除所有筛选',
                description: '重置所有筛选条件',
                detail: '显示所有提交'
            });
        }
        // 添加分支比较选项
        options.push({
            label: '⚖️ 比较分支/标签',
            description: this.isCompareMode ? '当前在比较模式' : '未比较',
            detail: '比较两个分支或标签的差异'
        });
        const selected = await vscode.window.showQuickPick(options, {
            placeHolder: '选择筛选操作'
        });
        if (selected) {
            switch (selected.label) {
                case '🌿 切换分支/标签':
                    await this.showBranchPicker();
                    break;
                case '👤 筛选作者':
                    await this.setAuthorFilter();
                    break;
                case '💬 筛选消息':
                    await this.setMessageFilter();
                    break;
                case '🗑️ 清除所有筛选':
                    await this.clearFilters();
                    break;
                case '⚖️ 比较分支/标签':
                    if (this.isCompareMode) {
                        await this.exitCompareMode();
                    }
                    else {
                        await this.compareBranchesMethod();
                    }
                    break;
            }
        }
    }
}
exports.GitLogProvider = GitLogProvider;
//# sourceMappingURL=gitLogProvider.js.map