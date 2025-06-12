import * as vscode from 'vscode';
import { GitService, GitCommit, GitBranch, GitTag } from './gitService';

export class GitLogWebviewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'gitLogExplorer.webview';
    
    private _view?: vscode.WebviewView;
    private commits: GitCommit[] = [];
    private currentBranch: string = '';
    private branches: GitBranch[] = [];
    private tags: GitTag[] = [];
    private authorFilter: string = '';
    private messageFilter: string = '';
    private isCompareMode: boolean = false;
    private compareInfo: { from: string, to: string } = { from: '', to: '' };
    private selectedCommits: Set<string> = new Set();

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private gitService: GitService
    ) {}

    public refresh() {
        this.initializeData();
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'initialize':
                    await this.initializeData();
                    break;
                case 'refreshRemote':
                    await this.refreshRemoteData();
                    break;
                case 'switchBranch':
                    await this.switchBranch(data.branch);
                    break;
                case 'filterAuthor':
                    await this.filterAuthor(data.author);
                    break;
                case 'filterMessage':
                    await this.filterMessage(data.message);
                    break;
                case 'clearFilters':
                    await this.clearFilters();
                    break;
                case 'showCompareModal':
                    await this.showCompareModal();
                    break;
                case 'compareBranches':
                    await this.compareBranches(data.from, data.to, data.hideIdentical, data.authorFilter);
                    break;
                case 'exitCompareMode':
                    await this.exitCompareMode();
                    break;
                case 'showCommitDetails':
                    await this.showCommitDetails(data.hash);
                    break;
                case 'showFileDiff':
                    await this.showFileDiff(data.hash, data.filePath);
                    break;
                case 'selectCommit':
                    this.toggleCommitSelection(data.hash);
                    break;
                case 'interactiveRebase':
                    await this.performInteractiveRebase(data.commits);
                    break;
                case 'getStashList':
                    await this.getStashList();
                    break;
                case 'createStash':
                    await this.createStash(data.message);
                    break;
                case 'applyStash':
                    await this.applyStash(data.index);
                    break;
                case 'dropStash':
                    await this.dropStash(data.index);
                    break;
                case 'getCherryPickCommits':
                    await this.getCherryPickCommits(data.branch);
                    break;
                case 'performRebase':
                    await this.performRebase(data.target, data.interactive);
                    break;
                case 'createBranch':
                    await this.createBranch(data.branchName, data.baseBranch, data.switchTo);
                    break;
                case 'deleteBranches':
                    await this.deleteBranches(data.branches, data.deleteRemote);
                    break;
                case 'performCherryPick':
                    await this.performCherryPick(data.commits);
                    break;
                case 'showStashManager':
                    await this.showStashManager();
                    break;
                case 'showRebaseModal':
                    await this.showRebaseModal();
                    break;
                case 'showCherryPickModal':
                    await this.showCherryPickModal();
                    break;
                case 'showCreateBranchModal':
                    await this.showCreateBranchModal();
                    break;
                case 'showDeleteBranchModal':
                    await this.showDeleteBranchModal();
                    break;
                case 'resetToRemote':
                    await this.resetToRemote();
                    break;
                case 'requestUserInput':
                    await this.handleUserInputRequest(data.inputType, data.prompt, data.callback);
                    break;
                case 'toggleCommitDetails':
                    await this.toggleCommitDetails(data.hash);
                    break;
                case 'loadCommitFiles':
                    await this.loadCommitFiles(data.hash);
                    break;
                case 'performMerge':
                    await this.performMerge();
                    break;
            }
        });

        setTimeout(() => this.initializeData(), 100);
    }

    private async initializeData() {
        try {
            const startTime = Date.now();
            console.log('🚀 开始初始化Git数据...');
            
            const isGitRepo = await this.gitService.isGitRepository();
            if (isGitRepo) {
                console.log('✅ 检测到Git仓库，开始加载数据...');
                
                try {
                    // 并行加载分支和标签数据以提升性能
                    console.log('📊 并行加载分支和标签数据...');
                    const [branches, tags] = await Promise.all([
                        this.gitService.getBranches(),
                        this.gitService.getTags()
                    ]);
                    
                    this.branches = branches;
                    this.tags = tags;
                    
                    const loadTime = Date.now() - startTime;
                    console.log(`📈 数据加载完成: ${branches.length}个分支, ${tags.length}个标签 (耗时: ${loadTime}ms)`);
                    
                    // 获取当前分支
                    this.currentBranch = await this.gitService.getCurrentBranch();
                    console.log(`🌿 当前分支: ${this.currentBranch}`);
                    
                    // 确保当前分支有效后再加载提交记录
                    if (this.currentBranch) {
                        await this.loadCommits();
                    } else {
                        console.warn('⚠️ 未找到当前分支，跳过提交加载');
                        this.commits = [];
                    }
                    
                    const totalTime = Date.now() - startTime;
                    console.log(`⏱️ 初始化完成 (总耗时: ${totalTime}ms)`);
                    this.updateWebview();
                    
                } catch (loadError) {
                    console.error('💥 数据加载失败:', loadError);
                    this.sendMessage({
                        type: 'error',
                        message: `数据加载失败: ${loadError}`
                    });
                }
            } else {
                console.log('📂 当前目录不是Git仓库');
                this.currentBranch = '';
                this.branches = [];
                this.tags = [];
                this.commits = [];
                this.updateWebview();
            }
            
        } catch (error) {
            console.error('💥 初始化失败:', error);
            this.sendMessage({
                type: 'error',
                message: `初始化失败: ${error}`
            });
        }
    }

    private async loadCommits() {
        try {
            console.log('🔄 开始加载提交记录...');
            
            // 检查当前分支是否有效
            if (!this.currentBranch) {
                console.warn('⚠️ 当前分支为空，无法加载提交记录');
                this.commits = [];
                return;
            }
            
            if (this.isCompareMode && this.compareInfo.from && this.compareInfo.to) {
                this.commits = await this.gitService.compareCommits(this.compareInfo.from, this.compareInfo.to);
            } else {
                if (this.authorFilter || this.messageFilter) {
                    this.commits = await this.gitService.filterCommits(
                        this.currentBranch,
                        this.authorFilter,
                        this.messageFilter
                    );
                } else {
                    // 增加显示的提交数量到200
                    this.commits = await this.gitService.getCommits(this.currentBranch, 200);
                }
            }
            
            console.log(`📄 提交记录加载完成: ${this.commits.length} 个提交`);
            
        } catch (error) {
            console.error('💥 加载提交失败:', error);
            this.commits = []; // 确保commits不为undefined
            this.sendMessage({
                type: 'error',
                message: `加载提交失败: ${error}`
            });
        }
    }

    private async switchBranch(branchName: string) {
        this.currentBranch = branchName;
        this.isCompareMode = false;
        await this.loadCommits();
        this.updateWebview();
    }

    private async filterAuthor(author: string) {
        this.authorFilter = author;
        await this.loadCommits();
        this.updateWebview();
    }

    private async filterMessage(message: string) {
        this.messageFilter = message;
        await this.loadCommits();
        this.updateWebview();
    }

    private async clearFilters() {
        this.authorFilter = '';
        this.messageFilter = '';
        await this.loadCommits();
        this.updateWebview();
    }

    private async showCompareModal() {
        this.sendMessage({
            type: 'showCompareModal',
            branches: this.branches,
            tags: this.tags
        });
    }

    private async compareBranches(from: string, to: string, hideIdentical: boolean = false, authorFilter: string = '') {
        console.log(`🔄 开始比较分支: ${from} vs ${to}`);
        
        try {
            // 获取两个分支的完整提交列表
            const fromCommits = await this.gitService.getCommits(from, 200);
            const toCommits = await this.gitService.getCommits(to, 200);
            
            // 应用作者筛选
            let filteredFromCommits = fromCommits;
            let filteredToCommits = toCommits;
            
            if (authorFilter) {
                filteredFromCommits = fromCommits.filter(commit => 
                    commit.author.toLowerCase().includes(authorFilter.toLowerCase())
                );
                filteredToCommits = toCommits.filter(commit => 
                    commit.author.toLowerCase().includes(authorFilter.toLowerCase())
                );
            }
            
            // 如果选择隐藏相同提交，则过滤掉commit message完全相同的提交
            if (hideIdentical) {
                const fromMessages = new Set(filteredFromCommits.map(c => c.message));
                const toMessages = new Set(filteredToCommits.map(c => c.message));
                
                filteredFromCommits = filteredFromCommits.filter(commit => 
                    !toMessages.has(commit.message)
                );
                filteredToCommits = filteredToCommits.filter(commit => 
                    !fromMessages.has(commit.message)
                );
            }
            
            // 生成美化的HTML格式比较内容
            const htmlContent = this.generateComparisonHTML(from, to, {
                fromCommits: filteredFromCommits,
                toCommits: filteredToCommits
            }, hideIdentical, authorFilter);
            
            // 创建webview panel来渲染HTML内容
            const panel = vscode.window.createWebviewPanel(
                'gitBranchComparison',
                `Git 分支比较: ${from} ↔ ${to}`,
                vscode.ViewColumn.Active,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true
                }
            );
            
            // 设置HTML内容到webview
            panel.webview.html = htmlContent;
            
            vscode.window.showInformationMessage(`✅ 分支比较完成: ${from} ↔ ${to}`);
            
        } catch (error) {
            console.error('❌ 分支比较失败:', error);
            vscode.window.showErrorMessage(`分支比较失败: ${error}`);
        }
    }

    private generateComparisonHTML(fromBranch: string, toBranch: string, data: any, hideIdentical: boolean, authorFilter: string = ''): string {
        const title = authorFilter ? 
            `Git 分支比较: ${fromBranch} ↔ ${toBranch} - 作者筛选: ${authorFilter}` :
            `Git 分支比较: ${fromBranch} ↔ ${toBranch}`;
            
        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background: #f8f9fa;
            color: #333;
            line-height: 1.6;
        }
        
        .comparison-container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            text-align: center;
        }
        
        .header h1 {
            margin: 0;
            font-size: 24px;
            font-weight: 600;
        }
        
        .stats-bar {
            background: #f1f3f4;
            padding: 15px 20px;
            border-bottom: 1px solid #e1e4e8;
            display: flex;
            justify-content: space-around;
            flex-wrap: wrap;
            gap: 10px;
        }
        
        .stat-item {
            display: flex;
            align-items: center;
            gap: 8px;
            font-weight: 500;
        }
        
        .stat-number {
            background: #6f42c1;
            color: white;
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: bold;
        }
        
        .comparison-content {
            display: flex;
            min-height: 400px;
        }
        
        .branch-column {
            flex: 1;
            border-right: 1px solid #e1e4e8;
        }
        
        .branch-column:last-child {
            border-right: none;
        }
        
        .branch-header {
            background: #f8f9fa;
            padding: 15px 20px;
            border-bottom: 1px solid #e1e4e8;
            position: sticky;
            top: 0;
            z-index: 10;
        }
        
        .branch-title {
            font-size: 18px;
            font-weight: 600;
            margin: 0;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .branch-tag {
            background: #0366d6;
            color: white;
            padding: 4px 12px;
            border-radius: 16px;
            font-size: 12px;
            font-weight: 500;
        }
        
        .commits-list {
            padding: 20px;
            max-height: 600px;
            overflow-y: auto;
        }
        
        .commit-card {
            background: #f8f9fa;
            border: 1px solid #e1e4e8;
            border-radius: 6px;
            padding: 15px;
            margin-bottom: 15px;
            transition: all 0.2s ease;
        }
        
        .commit-card:hover {
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            transform: translateY(-1px);
        }
        
        .commit-hash {
            font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
            background: #f6f8fa;
            color: #0366d6;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 12px;
            font-weight: 600;
        }
        
        .commit-message {
            font-weight: 500;
            margin: 8px 0;
            color: #24292e;
        }
        
        .commit-meta {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 12px;
            color: #586069;
        }
        
        .commit-author {
            display: flex;
            align-items: center;
            gap: 5px;
        }
        
        .author-avatar {
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: #6f42c1;
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 8px;
            font-weight: bold;
        }
        
        .commit-date {
            color: #586069;
        }
        
        .empty-state {
            text-align: center;
            padding: 60px 20px;
            color: #586069;
        }
        
        .empty-icon {
            font-size: 48px;
            margin-bottom: 15px;
            opacity: 0.5;
        }
        
        @media (max-width: 768px) {
            .comparison-content {
                flex-direction: column;
            }
            
            .branch-column {
                border-right: none;
                border-bottom: 1px solid #e1e4e8;
            }
            
            .branch-column:last-child {
                border-bottom: none;
            }
            
            .stats-bar {
                flex-direction: column;
                align-items: center;
            }
        }
    </style>
</head>
<body>
    <div class="comparison-container">
        <div class="header">
            <h1>🔀 ${title}</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">生成时间: ${new Date().toLocaleString('zh-CN')}</p>
            ${hideIdentical ? '<p style="margin: 5px 0 0 0; opacity: 0.8; font-size: 14px;">🔍 已隐藏相同提交</p>' : ''}
        </div>
        
        <div class="stats-bar">
            <div class="stat-item">
                📊 <span class="stat-number">${data.fromCommits.length}</span> ${fromBranch} 提交数
            </div>
            <div class="stat-item">
                📈 <span class="stat-number">${data.toCommits.length}</span> ${toBranch} 提交数  
            </div>
            ${authorFilter ? `<div class="stat-item">👤 作者筛选: ${this.escapeHtml(authorFilter)}</div>` : ''}
        </div>
        
        ${this.generateComparisonBody(fromBranch, toBranch, data, hideIdentical)}
    </div>
</body>
</html>`;
    }

    private generateComparisonBody(fromBranch: string, toBranch: string, data: any, hideIdentical: boolean): string {
        // 检查是否有提交
        const hasAnyCommits = data.fromCommits.length > 0 || data.toCommits.length > 0;
        
        if (!hasAnyCommits) {
            return `
                <div class="empty-state">
                    <div class="empty-icon">📭</div>
                    <h3>没有找到提交记录</h3>
                    <p>请检查分支名称或筛选条件</p>
                </div>
            `;
        }
        
        let html = '<div class="comparison-content">';
        
        // 左侧分支列
        html += `
            <div class="branch-column">
                <div class="branch-header">
                    <h3 class="branch-title">
                        <span class="branch-tag">${fromBranch}</span>
                        提交列表 (${data.fromCommits.length})
                    </h3>
                </div>
                <div class="commits-list">
                    ${this.renderCommitCards(data.fromCommits, '🔵')}
                </div>
            </div>
        `;
        
        // 右侧分支列
        html += `
            <div class="branch-column">
                <div class="branch-header">
                    <h3 class="branch-title">
                        <span class="branch-tag">${toBranch}</span>
                        提交列表 (${data.toCommits.length})
                    </h3>
                </div>
                <div class="commits-list">
                    ${this.renderCommitCards(data.toCommits, '🟢')}
                </div>
            </div>
        `;
        
        html += '</div>';
        
        return html;
    }

    private renderCommitCards(commits: any[], icon: string): string {
        if (commits.length === 0) {
            return `
                <div class="empty-state">
                    <div class="empty-icon">📭</div>
                    <p>没有提交记录</p>
                </div>
            `;
        }
        
        return commits.map(commit => {
            const authorName = commit.author.replace(/<.*>/, '').trim();
            const fullHash = commit.hash; // 显示完整hash
            const date = new Date(commit.date).toLocaleDateString('zh-CN');
            const authorInitials = authorName.split(' ').map((n: string) => n[0] || '').join('').substring(0, 2).toUpperCase();
            
            return `
                <div class="commit-card">
                    <div class="commit-hash">${icon} ${fullHash}</div>
                    <div class="commit-message">${this.escapeHtml(commit.message)}</div>
                    <div class="commit-meta">
                        <div class="commit-author">
                            <div class="author-avatar">${authorInitials}</div>
                            ${this.escapeHtml(authorName)}
                        </div>
                        <div class="commit-date">${date}</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    private escapeHtml(text: string): string {
        if (!text) return '';
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    private async exitCompareMode() {
        this.isCompareMode = false;
        this.compareInfo = { from: '', to: '' };
        
        if (this.currentBranch) {
            await this.loadCommits();
        } else {
            this.commits = [];
        }
        
        this.updateWebview();
        vscode.window.showInformationMessage('已退出比较模式');
    }

    private async showCommitDetails(hash: string) {
        try {
            const files = await this.gitService.getCommitFiles(hash);
            const commit = this.commits.find(c => c.hash === hash);
            if (commit) {
                // 获取文件状态信息
                const filesWithStatus = await this.getCommitFilesWithStatus(hash, files);
                
                this.sendMessage({
                    type: 'commitDetails',
                    commit: commit,
                    files: filesWithStatus
                });
            }
        } catch (error) {
            this.sendMessage({
                type: 'error',
                message: `获取提交详情失败: ${error}`
            });
        }
    }

    private async getCommitFilesWithStatus(hash: string, files: string[]): Promise<any[]> {
        try {
            // 使用git show --name-status 获取文件状态
            if (!this.gitService) {
                return files.map(file => ({ path: file, status: 'M' }));
            }
            
            // 直接调用git命令获取文件状态
            const result = await (this.gitService as any).git?.show(['--name-status', '--pretty=format:', hash]);
            if (!result) {
                return files.map(file => ({ path: file, status: 'M' }));
            }
            
            const statusLines = result.split('\n').filter((line: string) => line.trim() !== '');
            const filesWithStatus = statusLines.map((line: string) => {
                const parts = line.split('\t');
                const status = parts[0] || 'M';
                const path = parts[1] || line;
                return { path, status };
            });
            
            return filesWithStatus;
        } catch (error) {
            console.error('获取文件状态失败:', error);
            return files.map(file => ({ path: file, status: 'M' }));
        }
    }

    private async showFileDiff(hash: string, filePath: string) {
        try {
            const beforeContent = await this.getFileContentBefore(hash, filePath);
            const afterContent = await this.gitService.getFileContent(hash, filePath);

            const timestamp = Date.now();
            const beforeScheme = `git-before-${timestamp}`;
            const afterScheme = `git-after-${timestamp}`;
            
            const beforeUri = vscode.Uri.parse(`${beforeScheme}:${hash}~1:${filePath}`);
            const afterUri = vscode.Uri.parse(`${afterScheme}:${hash}:${filePath}`);

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

            const beforeDisposable = vscode.workspace.registerTextDocumentContentProvider(beforeScheme, beforeProvider);
            const afterDisposable = vscode.workspace.registerTextDocumentContentProvider(afterScheme, afterProvider);

            try {
                await vscode.commands.executeCommand('vscode.diff', beforeUri, afterUri, 
                    `${filePath} (${hash.substring(0, 8)})`);
            } finally {
                setTimeout(() => {
                    beforeDisposable.dispose();
                    afterDisposable.dispose();
                }, 5000);
            }

        } catch (error) {
            this.sendMessage({
                type: 'error',
                message: `显示文件差异失败: ${error}`
            });
        }
    }

    private async getFileContentBefore(commitHash: string, filePath: string): Promise<string> {
        try {
            return await this.gitService.getFileContent(`${commitHash}~1`, filePath);
        } catch (error) {
            return '';
        }
    }

    private async refreshRemoteData() {
        try {
            await this.gitService.refreshFromRemote();
            this.branches = await this.gitService.getBranches();
            this.tags = await this.gitService.getTags();
            
            if (this.currentBranch) {
                await this.loadCommits();
            }
            
            this.updateWebview();
            
        } catch (error) {
            console.error('刷新远程数据失败:', error);
            this.sendMessage({
                type: 'error',
                message: `刷新远程数据失败: ${error}`
            });
        }
    }

    private toggleCommitSelection(hash: string) {
        if (this.selectedCommits.has(hash)) {
            this.selectedCommits.delete(hash);
        } else {
            this.selectedCommits.add(hash);
        }
        this.updateWebview();
    }

    private async performInteractiveRebase(selectedHashes: string[]) {
        if (selectedHashes.length < 2) {
            this.sendMessage({
                type: 'error',
                message: '请选择至少2个提交进行合并'
            });
            return;
        }

        try {
            const action = await vscode.window.showQuickPick([
                { label: '🔗 合并提交 (squash)', value: 'squash' },
                { label: '✏️ 编辑提交消息', value: 'edit' },
                { label: '🔄 重新排序', value: 'reorder' },
                { label: '🗑️ 删除提交', value: 'drop' }
            ], { placeHolder: '选择要执行的操作' });

            if (action) {
                vscode.window.showInformationMessage(`模拟执行: ${action.label} - 已选择${selectedHashes.length}个提交`);
                this.selectedCommits.clear();
                this.updateWebview();
            }
        } catch (error) {
            this.sendMessage({
                type: 'error',
                message: `交互式rebase失败: ${error}`
            });
        }
    }

    private async showStashManager() {
        try {
            const stashList = await this.gitService.getStashList();
            this.sendMessage({
                type: 'stashList',
                stashes: stashList
            });
            this.sendMessage({
                type: 'showModal',
                modalId: 'stashModal'
            });
        } catch (error) {
            vscode.window.showErrorMessage(`获取stash列表失败: ${error}`);
        }
    }

    private async showRebaseModal() {
        try {
            const allBranches = this.branches.filter(b => b.name !== this.currentBranch);
            this.sendMessage({
                type: 'showModal',
                modalId: 'rebaseModal',
                data: { branches: allBranches }
            });
        } catch (error) {
            vscode.window.showErrorMessage(`显示rebase选项失败: ${error}`);
        }
    }

    private async resetToRemote() {
        try {
            const result = await vscode.window.showWarningMessage(
                `确定要强制重置当前分支 "${this.currentBranch}" 到远程版本吗？这将丢失所有本地更改！`,
                { modal: true },
                '确定重置'
            );
            
            if (result === '确定重置') {
                await this.gitService.resetToRemote(this.currentBranch);
                vscode.window.showInformationMessage(`已重置到远程分支 origin/${this.currentBranch}`);
                
                await this.loadCommits();
                this.updateWebview();
            }
        } catch (error) {
            vscode.window.showErrorMessage(`重置到远程分支失败: ${error}`);
        }
    }

    private async showCherryPickModal() {
        try {
            const availableBranches = this.branches.filter(b => b.name !== this.currentBranch);
            this.sendMessage({
                type: 'showModal',
                modalId: 'cherryPickModal',
                data: { branches: availableBranches }
            });
        } catch (error) {
            vscode.window.showErrorMessage(`显示cherry-pick选项失败: ${error}`);
        }
    }

    private async showCreateBranchModal() {
        try {
            this.sendMessage({
                type: 'showModal',
                modalId: 'createBranchModal',
                data: { branches: this.branches }
            });
        } catch (error) {
            vscode.window.showErrorMessage(`显示创建分支选项失败: ${error}`);
        }
    }

    private async showDeleteBranchModal() {
        try {
            const deletableBranches = this.branches.filter(b => 
                b.type === 'local' && b.name !== this.currentBranch
            );
            this.sendMessage({
                type: 'showModal',
                modalId: 'deleteBranchModal',
                data: { branches: deletableBranches }
            });
        } catch (error) {
            vscode.window.showErrorMessage(`显示删除分支选项失败: ${error}`);
        }
    }

    private updateWebview() {
        if (this._view) {
            console.log('🔄 更新WebView，数据状态:', {
                commits: this.commits?.length || 0,
                currentBranch: this.currentBranch,
                branches: this.branches?.length || 0,
                tags: this.tags?.length || 0
            });
            
            this.sendMessage({
                type: 'update',
                data: {
                    commits: this.commits || [],
                    currentBranch: this.currentBranch || '',
                    branches: this.branches || [],
                    tags: this.tags || [],
                    authorFilter: this.authorFilter,
                    messageFilter: this.messageFilter,
                    isCompareMode: this.isCompareMode,
                    compareInfo: this.compareInfo,
                    selectedCommits: Array.from(this.selectedCommits)
                }
            });
        }
    }

    private sendMessage(message: any) {
        if (this._view) {
            this._view.webview.postMessage(message);
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const nonce = getNonce();
        
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Git Log Explorer</title>
    <style nonce="${nonce}">
        body {
            padding: 8px;
            margin: 0;
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
        }

        .header {
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: 8px;
            margin-bottom: 8px;
        }

        .header-row {
            display: flex;
            align-items: center;
            margin-bottom: 6px;
            gap: 6px;
            flex-wrap: wrap;
        }

        .filter-input, .branch-input {
            padding: 4px 6px;
            border: 1px solid var(--vscode-input-border);
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border-radius: 2px;
            font-size: 12px;
            min-width: 100px;
        }

        .branch-input {
            width: 100%;
            padding: 4px 24px 4px 8px;
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 3px;
            color: var(--vscode-input-foreground);
            font-size: 12px;
            cursor: text;
        }

        .branch-input:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
            background: var(--vscode-input-background);
        }

        .branch-input:hover {
            border-color: var(--vscode-inputOption-hoverBackground);
        }

        .branch-selector {
            position: relative;
            flex: 1;
            max-width: 200px;
        }

        .branch-dropdown-icon {
            position: absolute;
            right: 6px;
            top: 50%;
            transform: translateY(-50%);
            cursor: pointer;
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
            pointer-events: auto;
        }

        .branch-dropdown {
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            background: var(--vscode-dropdown-background);
            border: 1px solid var(--vscode-dropdown-border);
            border-radius: 3px;
            max-height: 300px;
            overflow-y: auto;
            z-index: 1000;
            display: none;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        }

        .branch-dropdown.show {
            display: block;
        }

        .branch-option {
            padding: 6px 8px;
            cursor: pointer;
            border-bottom: 1px solid var(--vscode-panel-border);
            font-size: 12px;
        }

        .branch-option:hover {
            background: var(--vscode-list-hoverBackground);
        }

        .branch-option.current {
            background: var(--vscode-list-activeSelectionBackground);
            font-weight: bold;
            color: var(--vscode-list-activeSelectionForeground);
        }

        .branch-group-label {
            padding: 4px 8px;
            background: var(--vscode-panel-background);
            font-size: 10px;
            font-weight: bold;
            color: var(--vscode-descriptionForeground);
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        .current-branch-indicator {
            display: inline-block;
            width: 8px;
            height: 8px;
            background: var(--vscode-gitDecoration-addedResourceForeground);
            border-radius: 50%;
            margin-right: 6px;
        }

        .header-label {
            min-width: 20px;
            text-align: center;
        }

        .btn {
            padding: 4px 8px;
            border: 1px solid var(--vscode-button-border);
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border-radius: 2px;
            cursor: pointer;
            font-size: 12px;
            white-space: nowrap;
        }

        .btn:hover {
            background: var(--vscode-button-hoverBackground);
        }

        .btn-secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }

        .btn-danger {
            background: var(--vscode-inputValidation-errorBackground);
            color: var(--vscode-inputValidation-errorForeground);
            border-color: var(--vscode-inputValidation-errorBorder);
        }

        .advanced-functions {
            margin-top: 6px;
            border-top: 1px solid var(--vscode-panel-border);
            padding-top: 6px;
        }

        .advanced-buttons {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
        }

        .advanced-label {
            font-size: 11px;
            margin-bottom: 4px;
            color: var(--vscode-descriptionForeground);
            cursor: pointer;
            user-select: none;
        }

        .advanced-label:hover {
            color: var(--vscode-foreground);
        }

        .status-bar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 4px 0;
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            border-bottom: 1px solid var(--vscode-panel-border);
            margin-bottom: 8px;
        }

        .commits-container {
            max-height: calc(100vh - 300px);
            overflow-y: auto;
            background: var(--vscode-panel-background);
            padding: 12px;
            border-radius: 6px;
            border: 1px solid var(--vscode-panel-border);
        }

        .commit-item {
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            margin-bottom: 8px;
            background: var(--vscode-input-background);
            transition: all 0.2s ease;
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
        }

        .commit-item:hover {
            border-color: var(--vscode-focusBorder);
            background: var(--vscode-list-hoverBackground);
            box-shadow: 0 3px 8px rgba(0, 0, 0, 0.2);
        }

        .commit-item.selected {
            background: var(--vscode-list-activeSelectionBackground);
            border-color: var(--vscode-list-activeSelectionBackground);
        }

        .commit-header {
            padding: 8px;
            cursor: pointer;
            user-select: none;
        }

        .commit-first-line {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 4px;
        }

        .commit-second-line {
            padding-left: 24px;
        }

        .commit-checkbox {
            margin: 0;
            cursor: pointer;
            flex-shrink: 0;
        }

        .commit-hash {
            font-family: monospace;
            background: var(--vscode-textBlockQuote-background);
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 11px;
            color: var(--vscode-textLink-foreground);
            flex-shrink: 0;
            min-width: 70px;
        }

        .commit-author {
            color: var(--vscode-descriptionForeground);
            font-size: 11px;
            flex-shrink: 0;
            min-width: 80px;
            max-width: 120px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .commit-date {
            color: var(--vscode-descriptionForeground);
            font-size: 10px;
            flex-shrink: 0;
            min-width: 80px;
        }

        .commit-message {
            font-size: 12px;
            line-height: 1.4;
            color: var(--vscode-foreground);
            word-wrap: break-word;
            white-space: normal;
        }

        .commit-details {
            display: none;
            border-top: 1px solid var(--vscode-panel-border);
            padding: 12px;
            background: var(--vscode-textBlockQuote-background);
            animation: slideDown 0.2s ease;
        }

        .commit-details.expanded {
            display: block;
        }

        @keyframes slideDown {
            from {
                opacity: 0;
                max-height: 0;
            }
            to {
                opacity: 1;
                max-height: 500px;
            }
        }

        .commit-details-header {
            margin-bottom: 12px;
            padding-bottom: 8px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        .commit-details-row {
            display: flex;
            margin-bottom: 4px;
            font-size: 11px;
        }

        .commit-details-label {
            font-weight: bold;
            min-width: 60px;
            color: var(--vscode-foreground);
        }

        .commit-details-value {
            color: var(--vscode-descriptionForeground);
            font-family: monospace;
        }

        .commit-files {
            margin-top: 8px;
        }

        .commit-files-title {
            font-weight: bold;
            margin-bottom: 6px;
            font-size: 12px;
        }

        .file-item {
            display: flex;
            align-items: center;
            padding: 2px 0;
            font-size: 11px;
            font-family: monospace;
            cursor: pointer;
        }

        .file-item:hover {
            background: var(--vscode-list-hoverBackground);
        }

        .file-status {
            width: 24px;
            text-align: center;
            margin-right: 8px;
            font-weight: bold;
            font-size: 10px;
            padding: 1px 3px;
            border-radius: 2px;
            color: white;
        }

        .file-status.added {
            background: var(--vscode-gitDecoration-addedResourceForeground);
        }

        .file-status.modified {
            background: var(--vscode-gitDecoration-modifiedResourceForeground);
        }

        .file-status.deleted {
            background: var(--vscode-gitDecoration-deletedResourceForeground);
        }

        .file-status.renamed {
            background: var(--vscode-gitDecoration-renamedResourceForeground, #1f6feb);
        }

        .file-status.copied {
            background: var(--vscode-gitDecoration-untrackedResourceForeground, #8b949e);
        }

        .file-path {
            flex: 1;
        }

        .merge-actions {
            display: none;
            padding: 8px;
            background: var(--vscode-panel-background);
            border-top: 1px solid var(--vscode-panel-border);
            border-bottom: 1px solid var(--vscode-panel-border);
            margin-bottom: 8px;
            text-align: center;
        }

        .merge-actions.visible {
            display: block;
        }

        .merge-info {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 6px;
        }

        .btn-merge {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: 1px solid var(--vscode-button-border);
            padding: 6px 12px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
        }

        .btn-merge:hover {
            background: var(--vscode-button-hoverBackground);
        }

        .loading, .empty-state {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100px;
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
        }

        .loading-files {
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
            font-style: italic;
        }

        /* 模态框样式 */
        .modal {
            display: none;
            position: fixed;
            z-index: 1000;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0,0,0,0.5);
        }

        .modal-content {
            background-color: var(--vscode-editor-background);
            margin: 5% auto;
            padding: 20px;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            width: 80%;
            max-width: 600px;
            max-height: 80%;
            overflow-y: auto;
        }

        .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: 8px;
        }

        .modal-title {
            font-size: 16px;
            font-weight: bold;
        }

        .close {
            color: var(--vscode-descriptionForeground);
            font-size: 20px;
            font-weight: bold;
            cursor: pointer;
        }

        .close:hover {
            color: var(--vscode-foreground);
        }

        .form-group {
            margin-bottom: 12px;
        }

        .form-label {
            display: block;
            margin-bottom: 4px;
            font-size: 12px;
            color: var(--vscode-foreground);
        }

        .form-control {
            width: 100%;
            padding: 6px 8px;
            border: 1px solid var(--vscode-input-border);
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border-radius: 2px;
            font-size: 12px;
            box-sizing: border-box;
        }

        .form-control:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }

        .checkbox-group {
            display: flex;
            align-items: center;
            gap: 6px;
            margin: 8px 0;
        }

        .checkbox-group input[type="checkbox"] {
            margin: 0;
        }

        .modal-actions {
            display: flex;
            justify-content: flex-end;
            gap: 8px;
            margin-top: 16px;
            padding-top: 16px;
            border-top: 1px solid var(--vscode-panel-border);
        }

        .list-item {
            padding: 8px;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 2px;
            margin-bottom: 4px;
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .list-item:hover {
            background: var(--vscode-list-hoverBackground);
        }

        .list-item.selected {
            background: var(--vscode-list-activeSelectionBackground);
        }

        .list-container {
            max-height: 200px;
            overflow-y: auto;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 2px;
        }
    </style>
</head>
<body>
    <div id="app">
        <div class="loading">正在加载Git数据...</div>
    </div>

    <!-- 比较分支模态框 -->
    <div id="compareModal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <span class="modal-title">⚖️ 比较分支</span>
                <span class="close" data-modal="compareModal">&times;</span>
            </div>
            <div class="form-group">
                <label class="form-label">起始分支/标签:</label>
                <div class="branch-selector">
                    <input type="text" id="compareFrom" class="form-control" placeholder="搜索或选择起始分支...">
                    <span class="branch-dropdown-icon" data-action="toggleCompareFromDropdown">▼</span>
                    <div id="compareFromDropdown" class="branch-dropdown">
                        <div class="loading">正在加载...</div>
                    </div>
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">结束分支/标签:</label>
                <div class="branch-selector">
                    <input type="text" id="compareTo" class="form-control" placeholder="搜索或选择结束分支...">
                    <span class="branch-dropdown-icon" data-action="toggleCompareToDropdown">▼</span>
                    <div id="compareToDropdown" class="branch-dropdown">
                        <div class="loading">正在加载...</div>
                    </div>
                </div>
            </div>
            <div class="checkbox-group">
                <input type="checkbox" id="hideIdentical">
                <label for="hideIdentical">隐藏相同提交</label>
            </div>
            <div class="form-group">
                <label class="form-label">作者筛选 (可选):</label>
                <input type="text" id="compareAuthorFilter" class="form-control" placeholder="输入作者名称...">
            </div>
            <div class="modal-actions">
                <button class="btn btn-secondary" data-modal="compareModal" data-action="close">取消</button>
                <button class="btn" data-action="performCompare">开始比较</button>
            </div>
        </div>
    </div>

    <!-- Stash管理模态框 -->
    <div id="stashModal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <span class="modal-title">📦 Stash管理</span>
                <span class="close" data-modal="stashModal">&times;</span>
            </div>
            <div class="form-group">
                <label class="form-label">创建新Stash:</label>
                <input type="text" id="stashMessage" class="form-control" placeholder="输入stash消息...">
                <div style="margin-top: 6px;">
                    <button class="btn" data-action="createStash">💾 创建Stash</button>
                    <button class="btn btn-secondary" data-action="refreshStashList">🔄 刷新</button>
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">Stash列表:</label>
                <div id="stashList" class="list-container">
                    <div class="loading">正在加载...</div>
                </div>
            </div>
            <div class="modal-actions">
                <button class="btn btn-secondary" data-modal="stashModal" data-action="close">关闭</button>
            </div>
        </div>
    </div>

    <!-- Rebase模态框 -->
    <div id="rebaseModal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <span class="modal-title">🔄 Rebase分支</span>
                <span class="close" data-modal="rebaseModal">&times;</span>
            </div>
            <div class="form-group">
                <label class="form-label">选择Rebase到的分支:</label>
                <div class="branch-selector">
                    <input type="text" id="rebaseTarget" class="form-control" placeholder="搜索或选择目标分支...">
                    <span class="branch-dropdown-icon" data-action="toggleRebaseDropdown">▼</span>
                    <div id="rebaseDropdown" class="branch-dropdown">
                        <div class="loading">正在加载...</div>
                    </div>
                </div>
            </div>
            <div class="checkbox-group">
                <input type="checkbox" id="interactiveRebase">
                <label for="interactiveRebase">交互式Rebase</label>
            </div>
            <div class="modal-actions">
                <button class="btn btn-secondary" data-modal="rebaseModal" data-action="close">取消</button>
                <button class="btn" data-action="performRebase">开始Rebase</button>
            </div>
        </div>
    </div>

    <!-- Cherry-pick模态框 -->
    <div id="cherryPickModal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <span class="modal-title">🍒 Cherry-pick提交</span>
                <span class="close" data-modal="cherryPickModal">&times;</span>
            </div>
            <div class="form-group">
                <label class="form-label">选择源分支:</label>
                <div class="branch-selector">
                    <input type="text" id="cherryPickSource" class="form-control" placeholder="搜索或选择源分支...">
                    <span class="branch-dropdown-icon" data-action="toggleCherryPickDropdown">▼</span>
                    <div id="cherryPickDropdown" class="branch-dropdown">
                        <div class="loading">正在加载...</div>
                    </div>
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">选择要Cherry-pick的提交:</label>
                <div id="cherryPickCommits" class="list-container">
                    <div class="empty-state">请先选择源分支</div>
                </div>
            </div>
            <div class="modal-actions">
                <button class="btn btn-secondary" data-modal="cherryPickModal" data-action="close">取消</button>
                <button class="btn" data-action="performCherryPick">Cherry-pick</button>
            </div>
        </div>
    </div>

    <!-- 创建分支模态框 -->
    <div id="createBranchModal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <span class="modal-title">➕ 创建新分支</span>
                <span class="close" data-modal="createBranchModal">&times;</span>
            </div>
            <div class="form-group">
                <label class="form-label">新分支名称:</label>
                <input type="text" id="newBranchName" class="form-control" placeholder="输入新分支名称...">
            </div>
            <div class="form-group">
                <label class="form-label">基于分支:</label>
                <div class="branch-selector">
                    <input type="text" id="baseBranch" class="form-control" placeholder="搜索或选择基础分支...">
                    <span class="branch-dropdown-icon" data-action="toggleBaseBranchDropdown">▼</span>
                    <div id="baseBranchDropdown" class="branch-dropdown">
                        <div class="loading">正在加载...</div>
                    </div>
                </div>
            </div>
            <div class="checkbox-group">
                <input type="checkbox" id="switchToBranch" checked>
                <label for="switchToBranch">创建后切换到新分支</label>
            </div>
            <div class="modal-actions">
                <button class="btn btn-secondary" data-modal="createBranchModal" data-action="close">取消</button>
                <button class="btn" data-action="performCreateBranch">创建分支</button>
            </div>
        </div>
    </div>

    <!-- 删除分支模态框 -->
    <div id="deleteBranchModal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <span class="modal-title">🗑️ 删除分支</span>
                <span class="close" data-modal="deleteBranchModal">&times;</span>
            </div>
            <div class="form-group">
                <label class="form-label">选择要删除的分支 (可多选):</label>
                <div id="deleteBranchList" class="list-container">
                    <div class="loading">正在加载...</div>
                </div>
            </div>
            <div class="checkbox-group">
                <input type="checkbox" id="deleteRemoteAlso">
                <label for="deleteRemoteAlso">同时删除远程分支</label>
            </div>
            <div class="modal-actions">
                <button class="btn btn-secondary" data-modal="deleteBranchModal" data-action="close">取消</button>
                <button class="btn btn-danger" data-action="performDeleteBranches">删除分支</button>
            </div>
        </div>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        let currentData = {};
        let selectedStash = null;
        let selectedCherryPickCommits = [];
        let selectedDeleteBranches = [];
        let userInputCallbacks = {};

        function renderApp() {
            const app = document.getElementById('app');
            
            // 检查数据是否已初始化
            if (!currentData || currentData.branches === undefined) {
                app.innerHTML = '<div class="loading">正在加载Git数据...</div>';
                return;
            }

            console.log('🎨 渲染界面，数据:', {
                branches: currentData.branches?.length || 0,
                commits: currentData.commits?.length || 0,
                currentBranch: currentData.currentBranch
            });
            
            if (!currentData.branches || currentData.branches.length === 0) {
                app.innerHTML = '<div class="empty-state">当前目录不是Git仓库或没有分支</div>';
                return;
            }

            let html = '';
            html += '<div class="header">';
            
            html += '<div class="header-row">';
            html += '<span class="header-label">🌿</span>';
            
            html += '<div class="branch-selector">';
            const currentBranchDisplay = currentData.currentBranch ? 
                currentData.currentBranch : 
                '请选择分支...';
            html += '<input type="text" id="branchSearchInput" class="branch-input" ';
            html += 'placeholder="搜索或选择分支/标签..." ';
            html += 'value="' + escapeHtml(currentBranchDisplay) + '">';
            html += '<span class="branch-dropdown-icon" data-action="toggleBranchDropdown">▼</span>';
            html += '<div id="branchDropdown" class="branch-dropdown">';
            html += renderBranchOptions();
            html += '</div>';
            html += '</div>';
            
            html += '<button class="btn" data-action="refreshRemote">🔄 刷新</button>';
            html += '<button class="btn" data-action="showCompareModal">⚖️ 比较</button>';
            html += '</div>';

            // 显示当前分支状态
            if (currentData.currentBranch) {
                html += '<div class="header-row" style="font-size: 11px; color: var(--vscode-descriptionForeground);">';
                html += '<span class="current-branch-indicator"></span>';
                html += '当前分支: <strong>' + escapeHtml(currentData.currentBranch) + '</strong>';
                
                // 显示分支类型
                const currentBranchInfo = currentData.branches.find(b => b.name === currentData.currentBranch);
                if (currentBranchInfo) {
                    html += ' (' + (currentBranchInfo.type === 'local' ? '本地分支' : '远程分支') + ')';
                }
                html += '</div>';
            }
            
            html += '<div class="header-row">';
            html += '<span>👤</span>';
            html += '<input type="text" class="filter-input" id="authorFilter" placeholder="筛选作者..." value="' + escapeHtml(currentData.authorFilter || '') + '">';
            html += '<span>💬</span>';
            html += '<input type="text" class="filter-input" id="messageFilter" placeholder="筛选消息..." value="' + escapeHtml(currentData.messageFilter || '') + '">';
            if (currentData.authorFilter || currentData.messageFilter) {
                html += '<button class="btn btn-secondary" data-action="clearFilters">清除</button>';
            }
            html += '</div>';

            if (isLocalBranch()) {
                html += '<div class="advanced-functions">';
                html += '<div class="advanced-label" data-action="toggleAdvancedFunctions">⚡ 高级功能 <span id="advanced-toggle">▶</span></div>';
                html += '<div class="advanced-buttons" id="advanced-buttons" style="display: none;">';
                html += '<button class="btn" data-action="showStashManager">📦 Stash</button>';
                html += '<button class="btn" data-action="showRebaseModal">🔄 Rebase</button>';
                html += '<button class="btn" data-action="showCherryPickModal">🍒 Cherry-pick</button>';
                html += '<button class="btn" data-action="showCreateBranchModal">➕ 新分支</button>';
                html += '<button class="btn btn-danger" data-action="resetToRemote">⚠️ 重置</button>';
                html += '<button class="btn btn-danger" data-action="showDeleteBranchModal">🗑️ 删除分支</button>';
                html += '</div>';
                html += '</div>';
            }
            
            html += '</div>';

            html += '<div class="status-bar">';
            html += '<span>📊 ' + (currentData.commits ? currentData.commits.length : 0) + ' 个提交</span>';
            if (currentData.selectedCommits && currentData.selectedCommits.length > 0) {
                html += '<span>✅ 已选择 ' + currentData.selectedCommits.length + ' 个</span>';
            }
            if (currentData.isCompareMode) {
                html += '<button class="btn btn-secondary" data-action="exitCompareMode">退出比较</button>';
            }
            html += '</div>';

            html += '<div class="commits-container">';
            html += renderCommits();
            html += '</div>';

            app.innerHTML = html;
            setupEventListeners();
        }

        function renderCommits() {
            if (!currentData.commits || currentData.commits.length === 0) {
                if (!currentData.currentBranch) {
                    return '<div class="empty-state">请选择一个分支</div>';
                } else {
                    return '<div class="empty-state">暂无提交记录</div>';
                }
            }

            // 显示合并操作按钮
            const selectedCount = currentData.selectedCommits ? currentData.selectedCommits.length : 0;
            let mergeActionsHtml = '';
            if (selectedCount >= 2) {
                mergeActionsHtml = '<div class="merge-actions visible">' +
                    '<div class="merge-info">已选择 ' + selectedCount + ' 个提交</div>' +
                    '<button class="btn-merge" data-action="performMerge">合并选中的提交</button>' +
                    '</div>';
            }

            const commitsHtml = currentData.commits.map((commit, index) => {
                const shortHash = commit.hash.substring(0, 8);
                const authorName = commit.author.replace(/<.*>/, '').trim();
                const authorEmail = commit.author.match(/<(.+)>/);
                const fullAuthor = authorEmail ? authorName + ' <' + authorEmail[1] + '>' : authorName;
                const date = new Date(commit.date).toLocaleDateString('zh-CN');
                const fullDate = new Date(commit.date).toLocaleString('zh-CN');
                const isSelected = currentData.selectedCommits && currentData.selectedCommits.includes(commit.hash);

                return '<div class="commit-item ' + (isSelected ? 'selected' : '') + '" data-hash="' + escapeHtml(commit.hash) + '">' +
                    '<div class="commit-header" data-action="toggleCommitDetails">' +
                    '<div class="commit-first-line">' +
                    '<span class="commit-checkbox"><input type="checkbox" ' + (isSelected ? 'checked' : '') + ' data-action="toggleCommitSelection"></span>' +
                    '<span class="commit-hash">' + escapeHtml(shortHash) + '</span>' +
                    '<span class="commit-author">' + escapeHtml(authorName) + '</span>' +
                    '<span class="commit-date">' + escapeHtml(date) + '</span>' +
                    '</div>' +
                    '<div class="commit-second-line">' +
                    '<span class="commit-message">' + escapeHtml(commit.message) + '</span>' +
                    '</div>' +
                    '</div>' +
                    '<div class="commit-details" data-hash="' + escapeHtml(commit.hash) + '">' +
                    '<div class="commit-details-header">提交详情</div>' +
                    '<div class="commit-details-row"><span class="commit-details-label">提交者:</span><span class="commit-details-value">' + escapeHtml(fullAuthor) + '</span></div>' +
                    '<div class="commit-details-row"><span class="commit-details-label">提交时间:</span><span class="commit-details-value">' + escapeHtml(fullDate) + '</span></div>' +
                    '<div class="commit-details-row"><span class="commit-details-label">提交哈希:</span><span class="commit-details-value">' + escapeHtml(commit.hash) + '</span></div>' +
                    '<div class="commit-details-row"><span class="commit-details-label">提交信息:</span><span class="commit-details-value">' + escapeHtml(commit.message) + '</span></div>' +
                    '<div class="commit-files">' +
                    '<div class="commit-files-title">文件变更: <span class="loading-files">正在加载...</span></div>' +
                    '<div class="commit-file-list"></div>' +
                    '</div>' +
                    '</div>' +
                    '</div>';
            }).join('');

            return mergeActionsHtml + commitsHtml;
        }

        function renderBranchOptions(searchQuery = '') {
            let options = '';
            const query = searchQuery.toLowerCase();
            
            if (!currentData.branches || currentData.branches.length === 0) {
                return '<div class="branch-option">当前目录不是Git仓库</div>';
            }
            
            // 筛选分支和标签
            const filteredBranches = currentData.branches.filter(branch => 
                branch.name.toLowerCase().includes(query)
            );
            
            const filteredTags = currentData.tags ? currentData.tags.filter(tag => 
                tag.name.toLowerCase().includes(query)
            ) : [];
            
            // 对于大量结果，限制显示数量以提升性能
            const MAX_DISPLAY_ITEMS = 100;
            let totalItems = filteredBranches.length + filteredTags.length;
            let showingLimited = false;
            
            if (totalItems > MAX_DISPLAY_ITEMS) {
                showingLimited = true;
            }
            
            // 显示分支
            if (filteredBranches.length > 0) {
                options += '<div class="branch-group-label">分支</div>';
                const branchesToShow = showingLimited ? filteredBranches.slice(0, Math.min(80, filteredBranches.length)) : filteredBranches;
                
                branchesToShow.forEach(branch => {
                    const isCurrent = branch.name === currentData.currentBranch;
                    const branchClass = isCurrent ? 'branch-option current' : 'branch-option';
                    const prefix = branch.type === 'remote' ? 'origin/' : '';
                    const currentIndicator = isCurrent ? '● ' : '';
                    const currentLabel = isCurrent ? ' (当前分支)' : '';
                    
                    options += '<div class="' + branchClass + '" data-branch-name="' + 
                             escapeHtml(branch.name) + '">' + 
                             currentIndicator + prefix + escapeHtml(branch.name) + currentLabel + '</div>';
                });
            }
            
            // 显示标签
            if (filteredTags.length > 0) {
                options += '<div class="branch-group-label">标签</div>';
                const tagsToShow = showingLimited ? filteredTags.slice(0, Math.min(20, filteredTags.length)) : filteredTags;
                
                tagsToShow.forEach(tag => {
                    const isCurrent = tag.name === currentData.currentBranch;
                    const tagClass = isCurrent ? 'branch-option current' : 'branch-option';
                    const currentLabel = isCurrent ? ' (当前)' : '';
                    
                    options += '<div class="' + tagClass + '" data-branch-name="' + 
                             escapeHtml(tag.name) + '">' + 
                             '🏷️ ' + escapeHtml(tag.name) + currentLabel + '</div>';
                });
            }
            
            if (showingLimited) {
                options += '<div class="branch-option" style="font-style: italic; color: var(--vscode-descriptionForeground);">' +
                          '显示前 ' + MAX_DISPLAY_ITEMS + ' 项，请输入更多字符以筛选...</div>';
            }
            
            if (options === '') {
                options = '<div class="branch-option">未找到匹配的分支或标签</div>';
            }
            
            return options;
        }

        function setupEventListeners() {
            // 设置所有按钮的事件监听器
            document.querySelectorAll('[data-action]').forEach(element => {
                element.addEventListener('click', handleAction);
            });

            // 设置模态框关闭按钮
            document.querySelectorAll('[data-modal]').forEach(element => {
                element.addEventListener('click', function() {
                    const modal = this.getAttribute('data-modal');
                    if (this.getAttribute('data-action') === 'close' || this.classList.contains('close')) {
                        closeModal(modal);
                    }
                });
            });

            // 分支选项点击
            document.querySelectorAll('[data-branch-name]').forEach(element => {
                element.addEventListener('click', function() {
                    const branchName = this.getAttribute('data-branch-name');
                    if (branchName) {
                        selectBranch(branchName);
                    }
                });
            });

            // 分支输入框事件
            const branchInput = document.getElementById('branchSearchInput');
            if (branchInput) {
                branchInput.addEventListener('input', function() {
                    searchBranches(this.value);
                });
                
                branchInput.addEventListener('focus', handleBranchInputFocus);
                
                branchInput.addEventListener('keydown', handleBranchInputKeypress);
            }

            // 筛选输入框
            const authorFilter = document.getElementById('authorFilter');
            if (authorFilter) {
                authorFilter.addEventListener('change', function() {
                    filterAuthor(this.value);
                });
            }

            const messageFilter = document.getElementById('messageFilter');
            if (messageFilter) {
                messageFilter.addEventListener('change', function() {
                    filterMessage(this.value);
                });
            }

            // 提交项事件处理
            document.querySelectorAll('.commit-header').forEach(header => {
                header.addEventListener('click', function(event) {
                    // 阻止复选框点击事件冒泡
                    if (event.target.type === 'checkbox') {
                        return;
                    }
                    
                    const hash = this.closest('.commit-item').getAttribute('data-hash');
                    if (hash) {
                        toggleCommitDetails(hash);
                    }
                });
            });

            // 复选框点击事件
            document.querySelectorAll('.commit-checkbox input[type="checkbox"]').forEach(checkbox => {
                checkbox.addEventListener('click', function(event) {
                    event.stopPropagation();
                    const hash = this.closest('.commit-item').getAttribute('data-hash');
                    if (hash) {
                        toggleCommitSelection(hash);
                    }
                });
            });

            // cherry-pick源分支选择
            const cherryPickSource = document.getElementById('cherryPickSource');
            if (cherryPickSource) {
                cherryPickSource.addEventListener('change', loadCherryPickCommits);
            }

            // 点击文档其他地方关闭分支下拉框
            document.addEventListener('click', function(event) {
                const dropdown = document.getElementById('branchDropdown');
                const branchSelector = document.querySelector('.branch-selector');
                
                if (dropdown && branchSelector && !branchSelector.contains(event.target)) {
                    dropdown.classList.remove('show');
                }
                
                // 同时处理比较功能的下拉框
                const compareFromDropdown = document.getElementById('compareFromDropdown');
                const compareToDropdown = document.getElementById('compareToDropdown');
                const compareSelectors = document.querySelectorAll('#compareModal .branch-selector');
                
                let clickedInCompareSelector = false;
                compareSelectors.forEach(selector => {
                    if (selector.contains(event.target)) {
                        clickedInCompareSelector = true;
                    }
                });
                
                if (!clickedInCompareSelector) {
                    if (compareFromDropdown) compareFromDropdown.classList.remove('show');
                    if (compareToDropdown) compareToDropdown.classList.remove('show');
                }
            });
        }

        // 分支搜索相关函数
        function searchBranches(query) {
            const dropdown = document.getElementById('branchDropdown');
            dropdown.innerHTML = renderBranchOptions(query);
            dropdown.classList.add('show');
            
            // 重新设置分支选项的事件监听器
            dropdown.querySelectorAll('[data-branch-name]').forEach(element => {
                element.addEventListener('click', function() {
                    const branchName = this.getAttribute('data-branch-name');
                    if (branchName) {
                        selectBranch(branchName);
                    }
                });
            });
        }

        function handleBranchInputFocus() {
            const dropdown = document.getElementById('branchDropdown');
            const input = document.getElementById('branchSearchInput');
            dropdown.classList.add('show');
            
            // 点击或获得焦点时全选文字，方便用户直接输入
            setTimeout(() => {
                input.select();
            }, 50);
        }

        function handleBranchInputKeypress(event) {
            if (event.key === 'Enter') {
                const input = event.target;
                const branchName = input.value.trim();
                if (branchName) {
                    selectBranch(branchName);
                }
            }
        }

        function toggleBranchDropdown() {
            const dropdown = document.getElementById('branchDropdown');
            const input = document.getElementById('branchSearchInput');
            dropdown.classList.toggle('show');
            
            // 点击下拉箭头时也全选文字
            if (dropdown.classList.contains('show')) {
                setTimeout(() => {
                    input.focus();
                    input.select();
                }, 50);
            }
        }

        function selectBranch(branchName) {
            const input = document.getElementById('branchSearchInput');
            const dropdown = document.getElementById('branchDropdown');
            
            input.value = branchName;
            dropdown.classList.remove('show');
            
            vscode.postMessage({ type: 'switchBranch', branch: branchName });
        }

        function handleAction(event) {
            const action = event.target.getAttribute('data-action');
            
            switch (action) {
                case 'refreshRemote':
                    refreshRemote();
                    break;
                case 'showCompareModal':
                    showCompareModal();
                    break;
                case 'clearFilters':
                    clearFilters();
                    break;
                case 'exitCompareMode':
                    exitCompareMode();
                    break;
                case 'performCompare':
                    performCompare();
                    break;
                case 'showStashManager':
                    showStashManager();
                    break;
                case 'createStash':
                    createStash();
                    break;
                case 'refreshStashList':
                    refreshStashList();
                    break;
                case 'showRebaseModal':
                    showRebaseModal();
                    break;
                case 'performRebase':
                    performRebase();
                    break;
                case 'resetToRemote':
                    resetToRemote();
                    break;
                case 'showCherryPickModal':
                    showCherryPickModal();
                    break;
                case 'performCherryPick':
                    performCherryPick();
                    break;
                case 'showCreateBranchModal':
                    showCreateBranchModal();
                    break;
                case 'performCreateBranch':
                    performCreateBranch();
                    break;
                case 'showDeleteBranchModal':
                    showDeleteBranchModal();
                    break;
                case 'performDeleteBranches':
                    performDeleteBranches();
                    break;
                case 'toggleAdvancedFunctions':
                    toggleAdvancedFunctions();
                    break;
                case 'toggleBranchDropdown':
                    toggleBranchDropdown();
                    break;
                case 'toggleRebaseDropdown':
                    toggleRebaseDropdown();
                    break;
                case 'toggleCherryPickDropdown':
                    toggleCherryPickDropdown();
                    break;
                case 'toggleBaseBranchDropdown':
                    toggleBaseBranchDropdown();
                    break;
                case 'performMerge':
                    performMerge();
                    break;
            }
        }

        function escapeHtml(text) {
            if (!text) return '';
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        function isLocalBranch() {
            if (!currentData.branches || !currentData.currentBranch) {
                return false;
            }
            const currentBranch = currentData.branches.find(b => b.name === currentData.currentBranch);
            return currentBranch && currentBranch.type === 'local';
        }

        // 模态框通用函数
        function showModal(modalId) {
            document.getElementById(modalId).style.display = 'block';
        }

        function closeModal(modalId) {
            document.getElementById(modalId).style.display = 'none';
        }

        // 高级功能折叠/展开
        function toggleAdvancedFunctions() {
            const buttons = document.getElementById('advanced-buttons');
            const toggle = document.getElementById('advanced-toggle');
            
            if (buttons.style.display === 'none') {
                buttons.style.display = 'flex';
                toggle.textContent = '▼';
            } else {
                buttons.style.display = 'none';
                toggle.textContent = '▶';
            }
        }

        // 用户输入请求函数
        function requestUserInput(type, prompt, callback) {
            const callbackId = Date.now().toString();
            userInputCallbacks[callbackId] = callback;
            
            vscode.postMessage({
                type: 'requestUserInput',
                inputType: type,
                prompt: prompt,
                callback: callbackId
            });
        }

        // 确认对话框
        function confirmAction(message, callback) {
            requestUserInput('confirm', message, callback);
        }

        // 输入对话框
        function promptUser(message, callback) {
            requestUserInput('input', message, callback);
        }

        // 重置到远程
        function resetToRemote() {
            confirmAction('确定要强制重置当前分支到远程版本吗？这将丢失所有本地更改！', function(confirmed) {
                if (confirmed) {
                    vscode.postMessage({ type: 'resetToRemote' });
                }
            });
        }

        // Stash管理功能
        function showStashManager() {
            vscode.postMessage({ type: 'showStashManager' });
        }

        function createStash() {
            const message = document.getElementById('stashMessage').value.trim();
            if (!message) {
                alert('请输入stash消息');
                return;
            }
            vscode.postMessage({ type: 'createStash', message: message });
            document.getElementById('stashMessage').value = ''; // 清空输入框
        }

        function refreshStashList() {
            vscode.postMessage({ type: 'getStashList' });
        }

        function applyStash(index) {
            vscode.postMessage({ type: 'applyStash', index: index });
        }

        function dropStash(index) {
            confirmAction('确定要删除这个stash吗？', function(confirmed) {
                if (confirmed) {
                    vscode.postMessage({ type: 'dropStash', index: index });
                }
            });
        }

        function performDeleteBranches() {
            if (selectedDeleteBranches.length === 0) {
                alert('请选择要删除的分支');
                return;
            }
            
            const deleteRemote = document.getElementById('deleteRemoteAlso').checked;
            
            confirmAction('确定要删除选中的 ' + selectedDeleteBranches.length + ' 个分支吗？', function(confirmed) {
                if (confirmed) {
                    vscode.postMessage({ 
                        type: 'deleteBranches', 
                        branches: selectedDeleteBranches,
                        deleteRemote: deleteRemote
                    });
                    closeModal('deleteBranchModal');
                }
            });
        }

        // 消息处理
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.type) {
                case 'update':
                    currentData = message.data;
                    renderApp();
                    break;
                case 'error':
                    if (message.message) {
                        alert('错误: ' + message.message);
                    } else {
                        document.getElementById('app').innerHTML = '<div class="loading">错误: ' + escapeHtml(message.message) + '</div>';
                    }
                    break;
                case 'stashList':
                    renderStashList(message.stashes);
                    break;
                case 'cherryPickCommits':
                    renderCherryPickCommits(message.commits);
                    break;
                case 'userInputResponse':
                    handleUserInputResponse(message.callback, message.result);
                    break;
                case 'showModal':
                    showModal(message.modalId);
                    if (message.data) {
                        populateModalData(message.modalId, message.data);
                    }
                    break;
                case 'toggleCommitDetails':
                    // 这个消息只是用来通知前端，实际逻辑在前端处理
                    break;
                case 'commitFiles':
                    renderCommitFiles(message.hash, message.files);
                    break;
            }
        });

        function handleUserInputResponse(callbackId, result) {
            const callback = userInputCallbacks[callbackId];
            if (callback) {
                callback(result);
                delete userInputCallbacks[callbackId];
            }
        }

        // 基础功能函数
        function refreshRemote() {
            vscode.postMessage({ type: 'refreshRemote' });
        }

        function switchBranch(branchName) {
            if (branchName) {
                vscode.postMessage({ type: 'switchBranch', branch: branchName });
            }
        }

        function filterAuthor(author) {
            vscode.postMessage({ type: 'filterAuthor', author: author });
        }

        function filterMessage(message) {
            vscode.postMessage({ type: 'filterMessage', message: message });
        }

        function clearFilters() {
            vscode.postMessage({ type: 'clearFilters' });
        }

        function toggleCommitSelection(hash) {
            vscode.postMessage({ type: 'selectCommit', hash: hash });
        }

        function toggleCommitDetails(hash) {
            const commitItem = document.querySelector('.commit-item[data-hash="' + hash + '"]');
            const detailsDiv = commitItem.querySelector('.commit-details');
            
            // 关闭其他已展开的详情
            document.querySelectorAll('.commit-details.expanded').forEach(details => {
                if (details !== detailsDiv) {
                    details.classList.remove('expanded');
                }
            });
            
            // 切换当前详情的展开状态
            if (detailsDiv.classList.contains('expanded')) {
                detailsDiv.classList.remove('expanded');
            } else {
                detailsDiv.classList.add('expanded');
                // 加载文件列表
                loadCommitFiles(hash);
            }
        }

        function loadCommitFiles(hash) {
            vscode.postMessage({ type: 'loadCommitFiles', hash: hash });
        }

        function performMerge() {
            vscode.postMessage({ type: 'performMerge' });
        }

        function renderCommitFiles(hash, files) {
            const commitItem = document.querySelector('.commit-item[data-hash="' + hash + '"]');
            if (!commitItem) return;
            
            const fileListContainer = commitItem.querySelector('.commit-file-list');
            const loadingSpan = commitItem.querySelector('.loading-files');
            
            if (loadingSpan) {
                loadingSpan.style.display = 'none';
            }
            
            if (!files || files.length === 0) {
                fileListContainer.innerHTML = '<div class="file-item">无文件变更</div>';
                return;
            }
            
            const filesHtml = files.map(file => {
                let statusClass = '';
                let statusSymbol = '';
                
                switch (file.status) {
                    case 'A':
                        statusClass = 'added';
                        statusSymbol = '增';
                        break;
                    case 'M':
                        statusClass = 'modified';
                        statusSymbol = '改';
                        break;
                    case 'D':
                        statusClass = 'deleted';
                        statusSymbol = '删';
                        break;
                    case 'R':
                        statusClass = 'renamed';
                        statusSymbol = '移';
                        break;
                    case 'C':
                        statusClass = 'copied';
                        statusSymbol = '复';
                        break;
                    default:
                        statusClass = 'modified';
                        statusSymbol = '改';
                }
                
                return '<div class="file-item" data-file-path="' + escapeHtml(file.path) + '" data-commit-hash="' + escapeHtml(hash) + '">' +
                    '<span class="file-status ' + statusClass + '">' + statusSymbol + '</span>' +
                    '<span class="file-path">' + escapeHtml(file.path) + '</span>' +
                    '</div>';
            }).join('');
            
            fileListContainer.innerHTML = filesHtml;
            
            // 为文件项添加点击事件
            fileListContainer.querySelectorAll('.file-item').forEach(fileItem => {
                fileItem.addEventListener('click', function() {
                    const filePath = this.getAttribute('data-file-path');
                    const commitHash = this.getAttribute('data-commit-hash');
                    if (filePath && commitHash) {
                        vscode.postMessage({ 
                            type: 'showFileDiff', 
                            hash: commitHash, 
                            filePath: filePath 
                        });
                    }
                });
            });
        }

        function exitCompareMode() {
            vscode.postMessage({ type: 'exitCompareMode' });
        }

        // 比较分支功能
        function showCompareModal() {
            populateCompareOptions();
            showModal('compareModal');
        }

        function populateCompareOptions() {
            const fromDropdown = document.getElementById('compareFromDropdown');
            const toDropdown = document.getElementById('compareToDropdown');
            
            // 生成选项HTML
            const optionsHtml = renderBranchOptions();
            fromDropdown.innerHTML = optionsHtml;
            toDropdown.innerHTML = optionsHtml;
            
            // 设置事件监听器
            setupCompareDropdownListeners();
            
            // 恢复上次的选择
            if (currentData.compareInfo && currentData.compareInfo.from) {
                document.getElementById('compareFrom').value = currentData.compareInfo.from;
            }
            if (currentData.compareInfo && currentData.compareInfo.to) {
                document.getElementById('compareTo').value = currentData.compareInfo.to;
            }
        }

        function setupCompareDropdownListeners() {
            // 起始分支输入框
            const fromInput = document.getElementById('compareFrom');
            const fromDropdown = document.getElementById('compareFromDropdown');
            
            fromInput.addEventListener('input', function() {
                searchCompareOptions('from', this.value);
            });
            
            fromInput.addEventListener('focus', function() {
                fromDropdown.classList.add('show');
            });
            
            fromInput.addEventListener('keydown', function(event) {
                if (event.key === 'Enter') {
                    fromDropdown.classList.remove('show');
                }
            });
            
            // 结束分支输入框
            const toInput = document.getElementById('compareTo');
            const toDropdown = document.getElementById('compareToDropdown');
            
            toInput.addEventListener('input', function() {
                searchCompareOptions('to', this.value);
            });
            
            toInput.addEventListener('focus', function() {
                toDropdown.classList.add('show');
            });
            
            toInput.addEventListener('keydown', function(event) {
                if (event.key === 'Enter') {
                    toDropdown.classList.remove('show');
                }
            });
            
            // 设置选项点击事件
            setupCompareOptionClickListeners('from');
            setupCompareOptionClickListeners('to');
        }

        function searchCompareOptions(type, query) {
            const dropdown = document.getElementById('compare' + (type === 'from' ? 'From' : 'To') + 'Dropdown');
            const optionsHtml = renderBranchOptions(query);
            dropdown.innerHTML = optionsHtml;
            dropdown.classList.add('show');
            
            // 重新设置点击事件
            setupCompareOptionClickListeners(type);
        }

        function setupCompareOptionClickListeners(type) {
            const dropdown = document.getElementById('compare' + (type === 'from' ? 'From' : 'To') + 'Dropdown');
            const input = document.getElementById('compare' + (type === 'from' ? 'From' : 'To'));
            
            dropdown.querySelectorAll('[data-branch-name]').forEach(element => {
                element.addEventListener('click', function() {
                    const branchName = this.getAttribute('data-branch-name');
                    if (branchName) {
                        input.value = branchName;
                        dropdown.classList.remove('show');
                    }
                });
            });
        }

        function toggleCompareFromDropdown() {
            const dropdown = document.getElementById('compareFromDropdown');
            const input = document.getElementById('compareFrom');
            dropdown.classList.toggle('show');
            
            if (dropdown.classList.contains('show')) {
                input.focus();
            }
        }

        function toggleCompareToDropdown() {
            const dropdown = document.getElementById('compareToDropdown');
            const input = document.getElementById('compareTo');
            dropdown.classList.toggle('show');
            
            if (dropdown.classList.contains('show')) {
                input.focus();
            }
        }

        function performCompare() {
            const from = document.getElementById('compareFrom').value.trim();
            const to = document.getElementById('compareTo').value.trim();
            const hideIdentical = document.getElementById('hideIdentical').checked;
            const authorFilter = document.getElementById('compareAuthorFilter').value.trim();
            
            if (!from || !to) {
                alert('请选择要比较的分支或标签');
                return;
            }
            
            vscode.postMessage({ 
                type: 'compareBranches', 
                from: from, 
                to: to, 
                hideIdentical: hideIdentical,
                authorFilter: authorFilter
            });
            closeModal('compareModal');
        }

        // Rebase功能
        function showRebaseModal() {
            populateRebaseOptions();
            showModal('rebaseModal');
        }

        function populateRebaseOptions() {
            const input = document.getElementById('rebaseTarget');
            const dropdown = document.getElementById('rebaseDropdown');
            
            if (!input || !dropdown) return;
            
            // 生成选项HTML
            const optionsHtml = renderBranchOptions();
            dropdown.innerHTML = optionsHtml;
            
            // 设置事件监听器
            input.addEventListener('input', function() {
                const filteredOptionsHtml = renderBranchOptions(this.value);
                dropdown.innerHTML = filteredOptionsHtml;
                dropdown.classList.add('show');
                
                // 重新设置点击事件
                dropdown.querySelectorAll('[data-branch-name]').forEach(element => {
                    element.addEventListener('click', function() {
                        const branchName = this.getAttribute('data-branch-name');
                        if (branchName) {
                            input.value = branchName;
                            dropdown.classList.remove('show');
                        }
                    });
                });
            });
            
            input.addEventListener('focus', function() {
                dropdown.classList.add('show');
            });
            
            input.addEventListener('keydown', function(event) {
                if (event.key === 'Enter') {
                    dropdown.classList.remove('show');
                }
            });
            
            // 设置初始点击事件
            dropdown.querySelectorAll('[data-branch-name]').forEach(element => {
                element.addEventListener('click', function() {
                    const branchName = this.getAttribute('data-branch-name');
                    if (branchName) {
                        input.value = branchName;
                        dropdown.classList.remove('show');
                    }
                });
            });
        }

        function performRebase() {
            const target = document.getElementById('rebaseTarget').value;
            const interactive = document.getElementById('interactiveRebase').checked;
            
            if (!target) {
                alert('请选择目标分支');
                return;
            }
            
            vscode.postMessage({ 
                type: 'performRebase', 
                target: target,
                interactive: interactive
            });
            closeModal('rebaseModal');
        }

        // Cherry-pick功能
        function showCherryPickModal() {
            populateCherryPickOptions();
            showModal('cherryPickModal');
        }

        function populateCherryPickOptions() {
            const input = document.getElementById('cherryPickSource');
            const dropdown = document.getElementById('cherryPickDropdown');
            
            if (!input || !dropdown) return;
            
            // 生成选项HTML
            const optionsHtml = renderBranchOptions();
            dropdown.innerHTML = optionsHtml;
            
            // 设置事件监听器
            input.addEventListener('input', function() {
                const filteredOptionsHtml = renderBranchOptions(this.value);
                dropdown.innerHTML = filteredOptionsHtml;
                dropdown.classList.add('show');
                
                // 重新设置点击事件
                dropdown.querySelectorAll('[data-branch-name]').forEach(element => {
                    element.addEventListener('click', function() {
                        const branchName = this.getAttribute('data-branch-name');
                        if (branchName) {
                            input.value = branchName;
                            dropdown.classList.remove('show');
                            loadCherryPickCommits(); // 加载提交
                        }
                    });
                });
            });
            
            input.addEventListener('focus', function() {
                dropdown.classList.add('show');
            });
            
            input.addEventListener('keydown', function(event) {
                if (event.key === 'Enter') {
                    dropdown.classList.remove('show');
                }
            });
            
            // 设置初始点击事件
            dropdown.querySelectorAll('[data-branch-name]').forEach(element => {
                element.addEventListener('click', function() {
                    const branchName = this.getAttribute('data-branch-name');
                    if (branchName) {
                        input.value = branchName;
                        dropdown.classList.remove('show');
                        loadCherryPickCommits(); // 加载提交
                    }
                });
            });
        }

        function loadCherryPickCommits() {
            const branch = document.getElementById('cherryPickSource').value;
            if (branch) {
                vscode.postMessage({ type: 'getCherryPickCommits', branch: branch });
            }
        }

        function performCherryPick() {
            if (selectedCherryPickCommits.length === 0) {
                alert('请选择要cherry-pick的提交');
                return;
            }
            
            vscode.postMessage({ 
                type: 'performCherryPick', 
                commits: selectedCherryPickCommits
            });
            closeModal('cherryPickModal');
        }

        // 创建分支功能
        function showCreateBranchModal() {
            populateBaseBranchOptions();
            showModal('createBranchModal');
        }

        function populateBaseBranchOptions() {
            const input = document.getElementById('baseBranch');
            const dropdown = document.getElementById('baseBranchDropdown');
            
            if (!input || !dropdown) return;
            
            // 生成选项HTML
            const optionsHtml = renderBranchOptions();
            dropdown.innerHTML = optionsHtml;
            
            // 设置事件监听器
            input.addEventListener('input', function() {
                const filteredOptionsHtml = renderBranchOptions(this.value);
                dropdown.innerHTML = filteredOptionsHtml;
                dropdown.classList.add('show');
                
                // 重新设置点击事件
                dropdown.querySelectorAll('[data-branch-name]').forEach(element => {
                    element.addEventListener('click', function() {
                        const branchName = this.getAttribute('data-branch-name');
                        if (branchName) {
                            input.value = branchName;
                            dropdown.classList.remove('show');
                        }
                    });
                });
            });
            
            input.addEventListener('focus', function() {
                dropdown.classList.add('show');
            });
            
            input.addEventListener('keydown', function(event) {
                if (event.key === 'Enter') {
                    dropdown.classList.remove('show');
                }
            });
            
            // 设置初始点击事件
            dropdown.querySelectorAll('[data-branch-name]').forEach(element => {
                element.addEventListener('click', function() {
                    const branchName = this.getAttribute('data-branch-name');
                    if (branchName) {
                        input.value = branchName;
                        dropdown.classList.remove('show');
                    }
                });
            });
        }

        function performCreateBranch() {
            const branchName = document.getElementById('newBranchName').value.trim();
            const baseBranch = document.getElementById('baseBranch').value;
            const switchTo = document.getElementById('switchToBranch').checked;
            
            if (!branchName) {
                alert('请输入分支名称');
                return;
            }
            
            if (!baseBranch) {
                alert('请选择基础分支');
                return;
            }
            
            vscode.postMessage({ 
                type: 'createBranch', 
                branchName: branchName,
                baseBranch: baseBranch,
                switchTo: switchTo
            });
            closeModal('createBranchModal');
        }

        // 删除分支功能
        function showDeleteBranchModal() {
            populateDeleteBranchOptions();
            showModal('deleteBranchModal');
        }

        function populateDeleteBranchOptions() {
            const container = document.getElementById('deleteBranchList');
            container.innerHTML = '';
            selectedDeleteBranches = []; // 重置选择
            
            if (currentData.branches) {
                const deletableBranches = currentData.branches.filter(b => 
                    b.type === 'local' && b.name !== currentData.currentBranch
                );
                
                deletableBranches.forEach(branch => {
                    const item = document.createElement('div');
                    item.className = 'list-item';
                    item.innerHTML = '<label><input type="checkbox" data-branch="' + 
                                   escapeHtml(branch.name) + '"> ' + escapeHtml(branch.name) + '</label>';
                    
                    const checkbox = item.querySelector('input[type="checkbox"]');
                    checkbox.addEventListener('change', function() {
                        const branchName = this.getAttribute('data-branch');
                        if (this.checked) {
                            if (!selectedDeleteBranches.includes(branchName)) {
                                selectedDeleteBranches.push(branchName);
                            }
                        } else {
                            const index = selectedDeleteBranches.indexOf(branchName);
                            if (index > -1) {
                                selectedDeleteBranches.splice(index, 1);
                            }
                        }
                    });
                    
                    container.appendChild(item);
                });
                
                if (deletableBranches.length === 0) {
                    container.innerHTML = '<div class="empty-state">没有可删除的分支</div>';
                }
            }
        }

        function renderStashList(stashes) {
            const container = document.getElementById('stashList');
            container.innerHTML = '';
            
            if (stashes.length === 0) {
                container.innerHTML = '<div class="empty-state">没有stash</div>';
                return;
            }
            
            stashes.forEach((stash, index) => {
                const item = document.createElement('div');
                item.className = 'list-item';
                item.innerHTML = '<div><strong>stash@{' + index + '}</strong><br>' + 
                               escapeHtml(stash.message) + '</div>' +
                               '<div><button class="btn" data-stash-action="apply" data-index="' + index + '">应用</button> ' +
                               '<button class="btn btn-danger" data-stash-action="drop" data-index="' + index + '">删除</button></div>';
                
                // 为stash操作按钮添加事件监听器
                item.querySelectorAll('[data-stash-action]').forEach(btn => {
                    btn.addEventListener('click', function() {
                        const action = this.getAttribute('data-stash-action');
                        const index = parseInt(this.getAttribute('data-index'));
                        
                        if (action === 'apply') {
                            applyStash(index);
                        } else if (action === 'drop') {
                            dropStash(index);
                        }
                    });
                });
                
                container.appendChild(item);
            });
        }

        function renderCherryPickCommits(commits) {
            const container = document.getElementById('cherryPickCommits');
            container.innerHTML = '';
            selectedCherryPickCommits = []; // 重置选择
            
            if (commits.length === 0) {
                container.innerHTML = '<div class="empty-state">该分支没有提交</div>';
                return;
            }
            
            commits.forEach(commit => {
                const item = document.createElement('div');
                item.className = 'list-item';
                item.innerHTML = '<div><strong>' + commit.hash.substring(0, 8) + '</strong><br>' + 
                               escapeHtml(commit.message) + '</div>';
                
                item.addEventListener('click', function() {
                    const hash = commit.hash;
                    const index = selectedCherryPickCommits.indexOf(hash);
                    
                    if (index > -1) {
                        selectedCherryPickCommits.splice(index, 1);
                        this.classList.remove('selected');
                    } else {
                        selectedCherryPickCommits.push(hash);
                        this.classList.add('selected');
                    }
                });
                
                container.appendChild(item);
            });
        }

        // 点击模态框外部关闭
        window.addEventListener('click', function(event) {
            if (event.target.classList.contains('modal')) {
                event.target.style.display = 'none';
            }
        });

        vscode.postMessage({ type: 'initialize' });

        function populateModalData(modalId, data) {
            if (modalId === 'rebaseModal' && data.branches) {
                setupModalDropdown('rebaseTarget', 'rebaseDropdown', data.branches);
            } else if (modalId === 'cherryPickModal' && data.branches) {
                setupModalDropdown('cherryPickSource', 'cherryPickDropdown', data.branches);
            } else if (modalId === 'createBranchModal' && data.branches) {
                setupModalDropdown('baseBranch', 'baseBranchDropdown', data.branches);
            } else if (modalId === 'deleteBranchModal' && data.branches) {
                populateDeleteBranchList(data.branches);
            }
        }

        function setupModalDropdown(inputId, dropdownId, branches) {
            const input = document.getElementById(inputId);
            const dropdown = document.getElementById(dropdownId);
            
            if (!input || !dropdown) return;
            
            // 生成分支选项HTML（复用现有的renderBranchOptions逻辑）
            function renderModalBranchOptions(searchQuery = '') {
                let options = '';
                const query = searchQuery.toLowerCase();
                
                const filteredBranches = branches.filter(branch => 
                    branch.name.toLowerCase().includes(query)
                );
                
                if (filteredBranches.length > 0) {
                    filteredBranches.forEach(branch => {
                        const prefix = branch.type === 'remote' ? 'origin/' : '';
                        options += '<div class="branch-option" data-branch-name="' + 
                                 escapeHtml(branch.name) + '">' + 
                                 prefix + escapeHtml(branch.name) + '</div>';
                    });
                }
                
                if (options === '') {
                    options = '<div class="branch-option">未找到匹配的分支</div>';
                }
                
                return options;
            }
            
            // 初始化下拉框内容
            dropdown.innerHTML = renderModalBranchOptions();
            
            // 设置输入框事件（复用现有逻辑）
            input.addEventListener('input', function() {
                const optionsHtml = renderModalBranchOptions(this.value);
                dropdown.innerHTML = optionsHtml;
                dropdown.classList.add('show');
                
                // 重新设置点击事件
                dropdown.querySelectorAll('[data-branch-name]').forEach(element => {
                    element.addEventListener('click', function() {
                        const branchName = this.getAttribute('data-branch-name');
                        if (branchName) {
                            input.value = branchName;
                            dropdown.classList.remove('show');
                            
                            // 如果是cherry-pick源分支选择，加载提交
                            if (inputId === 'cherryPickSource') {
                                loadCherryPickCommits();
                            }
                        }
                    });
                });
            });
            
            input.addEventListener('focus', function() {
                dropdown.classList.add('show');
                setTimeout(() => {
                    input.select();
                }, 50);
            });
            
            input.addEventListener('keydown', function(event) {
                if (event.key === 'Enter') {
                    dropdown.classList.remove('show');
                }
            });
            
            // 设置初始点击事件
            dropdown.querySelectorAll('[data-branch-name]').forEach(element => {
                element.addEventListener('click', function() {
                    const branchName = this.getAttribute('data-branch-name');
                    if (branchName) {
                        input.value = branchName;
                        dropdown.classList.remove('show');
                        
                        // 如果是cherry-pick源分支选择，加载提交
                        if (inputId === 'cherryPickSource') {
                            loadCherryPickCommits();
                        }
                    }
                });
            });
        }

        function toggleRebaseDropdown() {
            const dropdown = document.getElementById('rebaseDropdown');
            const input = document.getElementById('rebaseTarget');
            dropdown.classList.toggle('show');
            
            if (dropdown.classList.contains('show')) {
                input.focus();
            }
        }

        function toggleCherryPickDropdown() {
            const dropdown = document.getElementById('cherryPickDropdown');
            const input = document.getElementById('cherryPickSource');
            dropdown.classList.toggle('show');
            
            if (dropdown.classList.contains('show')) {
                input.focus();
            }
        }

        function toggleBaseBranchDropdown() {
            const dropdown = document.getElementById('baseBranchDropdown');
            const input = document.getElementById('baseBranch');
            dropdown.classList.toggle('show');
            
            if (dropdown.classList.contains('show')) {
                input.focus();
            }
        }
    </script>
</body>
</html>`;
    }

    private async getStashList() {
        try {
            const stashList = await this.gitService.getStashList();
            this.sendMessage({
                type: 'stashList',
                stashes: stashList
            });
        } catch (error) {
            vscode.window.showErrorMessage(`获取stash列表失败: ${error}`);
        }
    }

    private async createStash(message: string) {
        try {
            // 验证message不能为空
            if (!message || message.trim() === '') {
                this.sendMessage({
                    type: 'error',
                    message: 'Stash消息不能为空'
                });
                return;
            }
            
            await this.gitService.createStash(message.trim());
            vscode.window.showInformationMessage('Stash已创建');
            await this.getStashList(); // 刷新列表
        } catch (error) {
            vscode.window.showErrorMessage(`创建stash失败: ${error}`);
        }
    }

    private async applyStash(index: number) {
        try {
            await this.gitService.applyStash(index, true); // pop模式
            vscode.window.showInformationMessage('Stash已应用');
            await this.getStashList(); // 刷新列表
            await this.loadCommits(); // 刷新提交列表
            this.updateWebview();
        } catch (error) {
            vscode.window.showErrorMessage(`应用stash失败: ${error}`);
        }
    }

    private async dropStash(index: number) {
        try {
            await this.gitService.dropStash(index);
            vscode.window.showInformationMessage('Stash已删除');
            await this.getStashList(); // 刷新列表
        } catch (error) {
            vscode.window.showErrorMessage(`删除stash失败: ${error}`);
        }
    }

    private async getCherryPickCommits(branch: string) {
        try {
            const commits = await this.gitService.getCommits(branch, 50);
            this.sendMessage({
                type: 'cherryPickCommits',
                commits: commits
            });
        } catch (error) {
            vscode.window.showErrorMessage(`获取分支提交失败: ${error}`);
        }
    }

    private async performRebase(target: string, interactive: boolean) {
        try {
            // 检查工作区状态
            const status = await this.gitService.getWorkingDirectoryStatus();
            if (status.hasChanges) {
                const result = await vscode.window.showWarningMessage(
                    '工作区有未提交的更改，请先提交或stash这些更改',
                    '取消'
                );
                return;
            }

            await this.gitService.rebaseOnto(target, interactive);
            vscode.window.showInformationMessage(`已rebase到 ${target}`);
            
            await this.loadCommits();
            this.updateWebview();
        } catch (error) {
            vscode.window.showErrorMessage(`Rebase失败: ${error}`);
        }
    }

    private async createBranch(branchName: string, baseBranch: string, switchTo: boolean) {
        try {
            // 检查分支名是否已存在
            const exists = await this.gitService.branchExists(branchName);
            if (exists) {
                vscode.window.showErrorMessage(`分支 "${branchName}" 已存在`);
                return;
            }

            await this.gitService.createBranch(branchName, baseBranch, switchTo);
            
            if (switchTo) {
                this.currentBranch = branchName;
                vscode.window.showInformationMessage(`已创建并切换到分支 "${branchName}"`);
            } else {
                vscode.window.showInformationMessage(`已创建分支 "${branchName}"`);
            }
            
            // 刷新数据
            this.branches = await this.gitService.getBranches();
            if (switchTo) {
                await this.loadCommits();
            }
            this.updateWebview();
        } catch (error) {
            vscode.window.showErrorMessage(`创建分支失败: ${error}`);
        }
    }

    private async deleteBranches(branches: string[], deleteRemote: boolean) {
        try {
            // 转换为gitService期望的格式
            const branchesToDelete = branches.map(name => ({
                name: name,
                deleteRemote: deleteRemote,
                force: false
            }));
            
            await this.gitService.deleteBranches(branchesToDelete);
            vscode.window.showInformationMessage(`成功删除 ${branches.length} 个分支`);
            
            // 刷新分支列表
            this.branches = await this.gitService.getBranches();
            this.updateWebview();
        } catch (error) {
            vscode.window.showErrorMessage(`删除分支失败: ${error}`);
        }
    }

    private async performCherryPick(commits: string[]) {
        try {
            // 检查工作区状态
            const status = await this.gitService.getWorkingDirectoryStatus();
            if (status.hasChanges) {
                const result = await vscode.window.showWarningMessage(
                    '工作区有未提交的更改，请先提交或stash这些更改',
                    '取消'
                );
                return;
            }

            if (commits.length === 1) {
                await this.gitService.cherryPick(commits[0]);
                vscode.window.showInformationMessage(`已cherry-pick提交 ${commits[0].substring(0, 8)}`);
            } else {
                await this.gitService.cherryPickMultiple(commits);
                vscode.window.showInformationMessage(`已cherry-pick ${commits.length} 个提交`);
            }
            
            await this.loadCommits();
            this.updateWebview();
        } catch (error) {
            vscode.window.showErrorMessage(`Cherry-pick失败: ${error}`);
        }
    }

    private async toggleCommitDetails(hash: string) {
        this.sendMessage({
            type: 'toggleCommitDetails',
            hash: hash
        });
    }

    private async loadCommitFiles(hash: string) {
        try {
            const files = await this.gitService.getCommitFiles(hash);
            const filesWithStatus = await this.getCommitFilesWithStatus(hash, files);
            
            this.sendMessage({
                type: 'commitFiles',
                hash: hash,
                files: filesWithStatus
            });
        } catch (error) {
            this.sendMessage({
                type: 'error',
                message: `加载提交文件失败: ${error}`
            });
        }
    }

    private async performMerge() {
        const selectedHashes = Array.from(this.selectedCommits);
        if (selectedHashes.length < 2) {
            this.sendMessage({
                type: 'error',
                message: '请选择至少2个提交进行合并'
            });
            return;
        }

        try {
            // 按时间顺序排序提交（最旧的在前）
            const commitsWithTime = selectedHashes.map(hash => {
                const commit = this.commits.find(c => c.hash === hash);
                return { hash, date: commit ? new Date(commit.date) : new Date() };
            }).sort((a, b) => a.date.getTime() - b.date.getTime());

            const sortedHashes = commitsWithTime.map(c => c.hash);
            
            const action = await vscode.window.showQuickPick([
                { label: '🔗 压缩合并 (squash)', value: 'squash', description: '将多个提交合并为一个' },
                { label: '✏️ 编辑提交消息', value: 'reword', description: '修改提交消息' },
                { label: '🔄 重新排序', value: 'reorder', description: '调整提交顺序' },
                { label: '🗑️ 删除提交', value: 'drop', description: '删除选中的提交' }
            ], { 
                placeHolder: `选择要对 ${selectedHashes.length} 个提交执行的操作`,
                ignoreFocusOut: true
            });

            if (action) {
                // 模拟git rebase -i操作
                const commitCount = sortedHashes.length;
                const baseCommit = sortedHashes[0];
                
                if (action.value === 'squash') {
                    const newMessage = await vscode.window.showInputBox({
                        prompt: '输入合并后的提交消息',
                        value: `合并 ${commitCount} 个提交`,
                        ignoreFocusOut: true
                    });
                    
                    if (newMessage) {
                        vscode.window.showInformationMessage(
                            `模拟执行: git rebase -i HEAD~${commitCount} (squash)\n` +
                            `将合并提交: ${sortedHashes.map(h => h.substring(0, 8)).join(', ')}\n` +
                            `新提交消息: ${newMessage}`
                        );
                    }
                } else {
                    vscode.window.showInformationMessage(
                        `模拟执行: git rebase -i HEAD~${commitCount} (${action.value})\n` +
                        `操作提交: ${sortedHashes.map(h => h.substring(0, 8)).join(', ')}`
                    );
                }
                
                // 清除选择
                this.selectedCommits.clear();
                this.updateWebview();
            }
        } catch (error) {
            this.sendMessage({
                type: 'error',
                message: `合并操作失败: ${error}`
            });
        }
    }

    private async handleUserInputRequest(inputType: string, prompt: string, callback: string) {
        try {
            if (inputType === 'confirm') {
                const result = await vscode.window.showWarningMessage(
                    prompt,
                    { modal: true },
                    '确定'
                );
                
                this.sendMessage({
                    type: 'userInputResponse',
                    callback: callback,
                    result: result === '确定'
                });
            } else if (inputType === 'input') {
                const result = await vscode.window.showInputBox({
                    prompt: prompt,
                    placeHolder: '请输入...'
                });
                
                this.sendMessage({
                    type: 'userInputResponse',
                    callback: callback,
                    result: result || ''
                });
            }
        } catch (error) {
            this.sendMessage({
                type: 'userInputResponse',
                callback: callback,
                result: null
            });
        }
    }
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
} 