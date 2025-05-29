import * as vscode from 'vscode';
import { GitService, GitCommit, GitBranch, GitTag } from './gitService';
import * as path from 'path';

export class GitLogItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly contextValue?: string,
        public readonly command?: vscode.Command,
        public readonly commit?: GitCommit,
        public readonly filePath?: string
    ) {
        super(label, collapsibleState);
        this.contextValue = contextValue;
        this.command = command;
    }
}

// 筛选控件项
export class FilterItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly contextValue: string,
        public readonly command?: vscode.Command
    ) {
        super(label, vscode.TreeItemCollapsibleState.Expanded);
        this.contextValue = contextValue;
        this.command = command;
    }
}

// 输入框控件
export class InputItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly contextValue: string,
        public readonly placeholder: string = '',
        public readonly value: string = ''
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.contextValue = contextValue;
        this.description = value || placeholder;
    }
}

export class GitLogProvider implements vscode.TreeDataProvider<GitLogItem | FilterItem | InputItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<GitLogItem | FilterItem | InputItem | undefined | null | void> = new vscode.EventEmitter<GitLogItem | FilterItem | InputItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<GitLogItem | FilterItem | InputItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private commits: GitCommit[] = [];
    private currentBranch: string = '';
    private authorFilter: string = '';
    private messageFilter: string = '';
    private isCompareMode: boolean = false;
    private compareInfo: { from: string, to: string } = { from: '', to: '' };
    private branches: GitBranch[] = [];
    private tags: GitTag[] = [];
    private isInitialized: boolean = false;

    constructor(private gitService: GitService) {
        // 延迟初始化，确保VSCode环境准备好
        setTimeout(() => this.initializeData(), 100);
    }

    private async initializeData(): Promise<void> {
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
        } catch (error) {
            console.error('Failed to initialize data:', error);
            vscode.window.showErrorMessage(`初始化Git数据失败: ${error}`);
        }
    }

    refresh(): void {
        this.initializeData();
    }

    getTreeItem(element: GitLogItem | FilterItem | InputItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: GitLogItem | FilterItem | InputItem): Promise<(GitLogItem | FilterItem | InputItem)[]> {
        if (!element) {
            // 根级别 - 显示筛选控件和提交列表
            const items: (GitLogItem | FilterItem | InputItem)[] = [];
            
            if (!this.isInitialized) {
                return [new FilterItem('正在加载Git数据...', 'loading')];
            }

            // 紧凑的筛选控件 - 合并到一行
            const filterStatus = this.getFilterStatusText();
            const filterControl = new InputItem(
                `📋 ${filterStatus}`,
                'filter-control',
                '点击配置筛选条件',
                ''
            );
            filterControl.command = {
                command: 'gitLogExplorer.showFilterMenu',
                title: 'Show Filter Menu'
            };
            items.push(filterControl);

            // 比较模式状态（如果存在）
            if (this.isCompareMode) {
                const compareStatus = new InputItem(
                    `⚖️ 比较模式: ${this.compareInfo.from} → ${this.compareInfo.to}`,
                    'compare-status',
                    '点击退出比较模式',
                    ''
                );
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
        } else if (element.contextValue === 'commit') {
            // 展开提交 - 显示文件列表
            return this.getCommitFileItems((element as GitLogItem).commit!);
        }
        return [];
    }

    private getFilterStatusText(): string {
        const parts: string[] = [];
        
        // 分支/标签
        parts.push(`分支: ${this.currentBranch}`);
        
        // 筛选条件
        const filters: string[] = [];
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

    private async loadCommits(): Promise<void> {
        try {
            const isGitRepo = await this.gitService.isGitRepository();
            if (!isGitRepo) {
                this.commits = [];
                return;
            }

            if (this.isCompareMode && this.compareInfo.from && this.compareInfo.to) {
                this.commits = await this.gitService.compareCommits(this.compareInfo.from, this.compareInfo.to);
            } else {
                if (!this.currentBranch) {
                    this.currentBranch = await this.gitService.getCurrentBranch();
                }

                if (this.authorFilter || this.messageFilter) {
                    this.commits = await this.gitService.filterCommits(
                        this.currentBranch,
                        this.authorFilter,
                        this.messageFilter
                    );
                } else {
                    this.commits = await this.gitService.getCommits(this.currentBranch);
                }
            }
        } catch (error) {
            vscode.window.showErrorMessage(`加载提交历史失败: ${error}`);
            this.commits = [];
        }
    }

    private async getCommitItems(): Promise<GitLogItem[]> {
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
            
            const item = new GitLogItem(
                label,
                vscode.TreeItemCollapsibleState.Collapsed,
                'commit',
                undefined,
                commit
            );
            
            item.description = description;
            item.iconPath = new vscode.ThemeIcon('git-commit');
            item.tooltip = `提交: ${commit.hash}\n作者: ${commit.author}\n日期: ${date}\n消息: ${commit.message}`;
            
            return item;
        });
    }

    private async getCommitFileItems(commit: GitCommit): Promise<GitLogItem[]> {
        try {
            const files = await this.gitService.getCommitFiles(commit.hash);
            
            return files.map(filePath => {
                const fileName = path.basename(filePath);
                const item = new GitLogItem(
                    fileName,
                    vscode.TreeItemCollapsibleState.None,
                    'file',
                    {
                        command: 'gitLogExplorer.showCommitDiff',
                        title: 'Show Diff',
                        arguments: [{ commit, filePath }]
                    },
                    commit,
                    filePath
                );
                
                item.description = filePath;
                item.iconPath = vscode.ThemeIcon.File;
                item.tooltip = `双击查看 ${filePath} 的差异`;
                
                return item;
            });
        } catch (error) {
            vscode.window.showErrorMessage(`加载提交文件失败: ${error}`);
            return [];
        }
    }

    // 新的筛选方法 - 显示分支选择器
    async showBranchPicker(): Promise<void> {
        try {
            const items: vscode.QuickPickItem[] = [
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
        } catch (error) {
            vscode.window.showErrorMessage(`切换分支失败: ${error}`);
        }
    }

    // 设置作者筛选
    async setAuthorFilter(): Promise<void> {
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
    async setMessageFilter(): Promise<void> {
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
    async clearFilters(): Promise<void> {
        this.authorFilter = '';
        this.messageFilter = '';
        await this.loadCommits();
        this._onDidChangeTreeData.fire();
    }

    // 兼容性方法
    async switchBranch(): Promise<void> {
        await this.showBranchPicker();
    }

    async filterAuthor(): Promise<void> {
        await this.setAuthorFilter();
    }

    async filterMessage(): Promise<void> {
        await this.setMessageFilter();
    }

    async filterCommits(): Promise<void> {
        await this.setAuthorFilter();
    }

    async compareBranchesMethod(): Promise<void> {
        try {
            const items: vscode.QuickPickItem[] = [
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

            if (!fromBranch) return;

            const toBranch = await vscode.window.showQuickPick(items, {
                placeHolder: '选择结束分支或标签'
            });

            if (!toBranch) return;

            // 获取分支差异并在编辑器中显示
            await this.showBranchComparisonInEditor(fromBranch.label, toBranch.label);

        } catch (error) {
            vscode.window.showErrorMessage(`比较分支失败: ${error}`);
        }
    }

    private async showBranchComparisonInEditor(fromBranch: string, toBranch: string): Promise<void> {
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
            
        } catch (error) {
            console.error('❌ 分支比较失败:', error);
            vscode.window.showErrorMessage(`分支比较失败: ${error}`);
        }
    }

    private generateBranchComparisonContent(fromBranch: string, toBranch: string, difference: any): string {
        const lines: string[] = [];
        
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

    async exitCompareMode(): Promise<void> {
        this.isCompareMode = false;
        this.compareInfo = { from: '', to: '' };
        await this.loadCommits();
        this._onDidChangeTreeData.fire();
    }

    async interactiveRebase(): Promise<void> {
        const selected = await vscode.window.showInformationMessage(
            '交互式变基功能',
            '此功能允许您选择多个提交进行合并或重新排序。请在树视图中选择多个提交，然后使用此功能。',
            '了解'
        );

        if (selected) {
            vscode.window.showInformationMessage(
                '使用方法：\n1. 在树视图中按住Ctrl键选择多个提交\n2. 右键选择"Interactive Rebase"\n3. 选择操作类型（合并、重新排序等）'
            );
        }
    }

    async showCommitDiff(item: any): Promise<void> {
        if (!item || !item.commit) {
            return;
        }

        const commit = item.commit as GitCommit;
        const filePath = item.filePath as string;

        try {
            if (filePath) {
                // 显示特定文件的差异
                await this.showFileDiff(commit, filePath);
            } else {
                // 显示整个提交的差异
                await this.showCommitDiffPanel(commit);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`显示差异失败: ${error}`);
        }
    }

    private async showFileDiff(commit: GitCommit, filePath: string): Promise<void> {
        try {
            // 获取提交前后的文件内容
            const beforeContent = await this.getFileContentBefore(commit.hash, filePath);
            const afterContent = await this.gitService.getFileContent(commit.hash, filePath);

            // 创建临时文件用于比较
            const beforeUri = vscode.Uri.parse(`git-before:${commit.hash}~1:${filePath}`);
            const afterUri = vscode.Uri.parse(`git-after:${commit.hash}:${filePath}`);

            // 注册虚拟文档提供者
            const beforeProvider = new class implements vscode.TextDocumentContentProvider {
                provideTextDocumentContent(): string {
                    return beforeContent;
                }
            };

            const afterProvider = new class implements vscode.TextDocumentContentProvider {
                provideTextDocumentContent(): string {
                    return afterContent;
                }
            };

            vscode.workspace.registerTextDocumentContentProvider('git-before', beforeProvider);
            vscode.workspace.registerTextDocumentContentProvider('git-after', afterProvider);

            // 打开差异比较
            await vscode.commands.executeCommand('vscode.diff', beforeUri, afterUri, 
                `${path.basename(filePath)} (${commit.hash.substring(0, 8)})`);

        } catch (error) {
            vscode.window.showErrorMessage(`显示文件差异失败: ${error}`);
        }
    }

    private async getFileContentBefore(commitHash: string, filePath: string): Promise<string> {
        try {
            return await this.gitService.getFileContent(`${commitHash}~1`, filePath);
        } catch (error) {
            return '';
        }
    }

    private async showCommitDiffPanel(commit: GitCommit): Promise<void> {
        const diff = await this.gitService.getCommitDiff(commit.hash);
        
        const panel = vscode.window.createWebviewPanel(
            'gitCommitDiff',
            `提交差异 - ${commit.hash.substring(0, 8)}`,
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        panel.webview.html = this.getCommitDiffHtml(commit, diff);
    }

    private getCommitDiffHtml(commit: GitCommit, diff: string): string {
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

    private formatDiff(diff: string): string {
        return diff
            .split('\n')
            .map(line => {
                if (line.startsWith('+')) {
                    return `<div class="line-added">${this.escapeHtml(line)}</div>`;
                } else if (line.startsWith('-')) {
                    return `<div class="line-removed">${this.escapeHtml(line)}</div>`;
                } else {
                    return `<div class="line-context">${this.escapeHtml(line)}</div>`;
                }
            })
            .join('');
    }

    private escapeHtml(text: string): string {
        return text.replace(/&/g, '&amp;')
                   .replace(/</g, '&lt;')
                   .replace(/>/g, '&gt;')
                   .replace(/"/g, '&quot;')
                   .replace(/'/g, '&#39;');
    }

    // 显示筛选菜单
    async showFilterMenu(): Promise<void> {
        const options: vscode.QuickPickItem[] = [
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
                    } else {
                        await this.compareBranchesMethod();
                    }
                    break;
            }
        }
    }
} 