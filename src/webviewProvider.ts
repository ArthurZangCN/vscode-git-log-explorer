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
        
        const template = this.readTemplateFile('comparison-template.html');
        const styles = this.readTemplateFile('comparison-styles.css');
        
        const hideIdenticalMessage = hideIdentical ? 
            '<p style="margin: 5px 0 0 0; opacity: 0.8; font-size: 14px;">🔍 已隐藏相同提交</p>' : '';
        
        const authorFilterHtml = authorFilter ? 
            `<div class="stat-item">👤 作者筛选: ${this.escapeHtml(authorFilter)}</div>` : '';
        
        const comparisonBody = this.generateComparisonBody(fromBranch, toBranch, data, hideIdentical);
        
        return template
            .replace('{{TITLE}}', title)
            .replace('{{COMPARISON_STYLES}}', styles)
            .replace('{{TIMESTAMP}}', new Date().toLocaleString('zh-CN'))
            .replace('{{HIDE_IDENTICAL_MESSAGE}}', hideIdenticalMessage)
            .replace('{{FROM_COUNT}}', data.fromCommits.length.toString())
            .replace('{{TO_COUNT}}', data.toCommits.length.toString())
            .replace('{{FROM_BRANCH}}', fromBranch)
            .replace('{{TO_BRANCH}}', toBranch)
            .replace('{{AUTHOR_FILTER}}', authorFilterHtml)
            .replace('{{COMPARISON_BODY}}', comparisonBody);
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
        
        const fromCommitsHtml = this.renderCommitCards(data.fromCommits, '🔵');
        const toCommitsHtml = this.renderCommitCards(data.toCommits, '🟢');
        
        return `
            <div class="comparison-content">
                <div class="branch-column">
                    <div class="branch-header">
                        <h3 class="branch-title">
                            <span class="branch-tag">${fromBranch}</span>
                            提交列表 (${data.fromCommits.length})
                        </h3>
                    </div>
                    <div class="commits-list">
                        ${fromCommitsHtml}
                    </div>
                </div>
                
                <div class="branch-column">
                    <div class="branch-header">
                        <h3 class="branch-title">
                            <span class="branch-tag">${toBranch}</span>
                            提交列表 (${data.toCommits.length})
                        </h3>
                    </div>
                    <div class="commits-list">
                        ${toCommitsHtml}
                    </div>
                </div>
            </div>
        `;
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
        
        // 读取分离的文件内容
        const cssContent = this.readTemplateFile('webview-styles.css');
        const jsContent = this.readTemplateFile('webview-script.js');
        const modalContent = this.readTemplateFile('webview-modals.html');
        const mainTemplate = this.readTemplateFile('main-template.html');
        
        // 替换占位符
        return mainTemplate
            .replace(/\$\{webview\.cspSource\}/g, webview.cspSource)
            .replace(/\$\{nonce\}/g, nonce)
            .replace('CSS_CONTENT_PLACEHOLDER', cssContent)
            .replace('MODAL_CONTENT_PLACEHOLDER', modalContent)
            .replace('JS_CONTENT_PLACEHOLDER', jsContent);
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
    private readTemplateFile(fileName: string): string {
        try {
            const fs = require('fs');
            const path = require('path');
            // 首先尝试从src目录读取（开发环境）
            let filePath = vscode.Uri.joinPath(this._extensionUri, 'src', fileName);
            
            if (fs.existsSync(filePath.fsPath)) {
                return fs.readFileSync(filePath.fsPath, 'utf8');
            }
            
            // 如果src目录不存在，尝试从out目录读取（生产环境）
            filePath = vscode.Uri.joinPath(this._extensionUri, 'out', fileName);
            if (fs.existsSync(filePath.fsPath)) {
                return fs.readFileSync(filePath.fsPath, 'utf8');
            }
            
            // 最后尝试从根目录读取
            filePath = vscode.Uri.joinPath(this._extensionUri, fileName);
            if (fs.existsSync(filePath.fsPath)) {
                return fs.readFileSync(filePath.fsPath, 'utf8');
            }
            
            throw new Error(`文件不存在: ${fileName}`);
        } catch (error) {
            console.error(`读取模板文件失败 ${fileName}:`, error);
            return '';
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