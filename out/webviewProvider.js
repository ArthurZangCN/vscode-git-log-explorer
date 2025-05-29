"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitLogWebviewProvider = void 0;
const vscode = require("vscode");
class GitLogWebviewProvider {
    constructor(_extensionUri, gitService) {
        this._extensionUri = _extensionUri;
        this.gitService = gitService;
        this.commits = [];
        this.currentBranch = '';
        this.branches = [];
        this.tags = [];
        this.authorFilter = '';
        this.messageFilter = '';
        this.isCompareMode = false;
        this.compareInfo = { from: '', to: '' };
        this.selectedCommits = new Set();
        this.branchSearchQuery = '';
        this.lastCompareFrom = '';
        this.lastCompareTo = '';
    }
    refresh() {
        this.initializeData();
    }
    resolveWebviewView(webviewView, context, _token) {
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
                case 'showBranchPicker':
                    await this.showBranchPicker();
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
                case 'searchBranches':
                    this.branchSearchQuery = data.query;
                    this.updateWebview();
                    break;
            }
        });
        setTimeout(() => this.initializeData(), 100);
    }
    async initializeData() {
        try {
            console.log('🚀 开始初始化Git数据...');
            const startTime = Date.now();
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
                    const currentBranch = await this.gitService.getCurrentBranch();
                    if (currentBranch) {
                        console.log(`🌿 当前分支: ${currentBranch}`);
                        this.currentBranch = currentBranch;
                        // 先更新UI显示分支列表，然后异步加载提交记录
                        this.updateWebview();
                        console.log('📝 异步加载当前分支的提交记录...');
                        await this.loadCommits();
                    }
                    else {
                        console.log('⚠️ 无法获取当前分支，设置为空状态');
                        this.currentBranch = '';
                        this.commits = [];
                    }
                }
                catch (error) {
                    console.error('❌ 加载Git数据失败:', error);
                    this.currentBranch = '';
                    this.branches = [];
                    this.tags = [];
                    this.commits = [];
                }
            }
            else {
                console.log('📂 当前目录不是Git仓库');
                this.currentBranch = '';
                this.branches = [];
                this.tags = [];
                this.commits = [];
            }
            const totalTime = Date.now() - startTime;
            console.log(`⏱️ 初始化完成，总耗时: ${totalTime}ms`);
            this.updateWebview();
        }
        catch (error) {
            console.error('💥 初始化失败:', error);
            this.currentBranch = '';
            this.branches = [];
            this.tags = [];
            this.commits = [];
            this.updateWebview();
        }
    }
    async loadCommits() {
        try {
            if (this.isCompareMode && this.compareInfo.from && this.compareInfo.to) {
                this.commits = await this.gitService.compareCommits(this.compareInfo.from, this.compareInfo.to);
            }
            else {
                if (this.authorFilter || this.messageFilter) {
                    this.commits = await this.gitService.filterCommits(this.currentBranch, this.authorFilter, this.messageFilter);
                }
                else {
                    this.commits = await this.gitService.getCommits(this.currentBranch);
                }
            }
        }
        catch (error) {
            this.sendMessage({
                type: 'error',
                message: `加载提交失败: ${error}`
            });
        }
    }
    async switchBranch(branchName) {
        this.currentBranch = branchName;
        this.isCompareMode = false;
        await this.loadCommits();
        this.updateWebview();
    }
    async filterAuthor(author) {
        this.authorFilter = author;
        await this.loadCommits();
        this.updateWebview();
    }
    async filterMessage(message) {
        this.messageFilter = message;
        await this.loadCommits();
        this.updateWebview();
    }
    async clearFilters() {
        this.authorFilter = '';
        this.messageFilter = '';
        await this.loadCommits();
        this.updateWebview();
    }
    async showCompareModal() {
        this.sendMessage({
            type: 'showCompareModal',
            branches: this.branches,
            tags: this.tags,
            lastCompareFrom: this.lastCompareFrom,
            lastCompareTo: this.lastCompareTo
        });
    }
    async compareBranches(from, to, hideIdentical = false, authorFilter = '') {
        console.log(`🔄 开始比较分支: ${from} vs ${to}, 隐藏相同提交: ${hideIdentical}, 作者筛选: ${authorFilter}`);
        // 保存用户选择的分支，下次打开模态框时使用
        this.lastCompareFrom = from;
        this.lastCompareTo = to;
        try {
            // 获取两个分支的git log
            let fromCommits = await this.gitService.getCommits(from, 100);
            let toCommits = await this.gitService.getCommits(to, 100);
            console.log(`🔍 原始数据: ${from}分支${fromCommits.length}个提交, ${to}分支${toCommits.length}个提交`);
            // 如果有作者筛选，先按作者筛选
            if (authorFilter) {
                console.log(`🔍 开始作者筛选，关键字: "${authorFilter}"`);
                // 显示调试信息
                vscode.window.showInformationMessage(`🔍 调试: 开始筛选作者"${authorFilter}"，原始数据: ${from}(${fromCommits.length}个) vs ${to}(${toCommits.length}个)`);
                // 输出筛选前的作者信息（前3个）
                console.log('筛选前的作者样本:');
                const beforeSample = fromCommits.slice(0, 3).map(c => c.author).join(', ');
                console.log(`From分支前3个作者: ${beforeSample}`);
                vscode.window.showInformationMessage(`📋 筛选前样本: ${beforeSample}`);
                const originalFromCount = fromCommits.length;
                const originalToCount = toCommits.length;
                fromCommits = fromCommits.filter(commit => commit.author.toLowerCase().includes(authorFilter.toLowerCase()));
                toCommits = toCommits.filter(commit => commit.author.toLowerCase().includes(authorFilter.toLowerCase()));
                console.log(`作者筛选后: ${from}分支${fromCommits.length}个提交(原${originalFromCount}个), ${to}分支${toCommits.length}个提交(原${originalToCount}个)`);
                // 显示筛选结果
                vscode.window.showInformationMessage(`✅ 筛选结果: ${from}(${fromCommits.length}/${originalFromCount}) vs ${to}(${toCommits.length}/${originalToCount})`);
                // 输出筛选后的作者信息（前3个）
                if (fromCommits.length > 0) {
                    const afterSample = fromCommits.slice(0, 3).map(c => c.author).join(', ');
                    console.log(`筛选后From分支前3个作者: ${afterSample}`);
                    vscode.window.showInformationMessage(`📋 筛选后样本: ${afterSample}`);
                }
                else {
                    vscode.window.showWarningMessage(`⚠️ 筛选后${from}分支没有匹配的提交`);
                }
            }
            let resultContent = '';
            let finalFromCommits = fromCommits;
            let finalToCommits = toCommits;
            if (hideIdentical) {
                console.log(`🔍 开始隐藏相同提交`);
                vscode.window.showInformationMessage(`🔍 开始隐藏相同提交，当前: ${from}(${fromCommits.length}) vs ${to}(${toCommits.length})`);
                // 注意：这里使用已经按作者筛选过的fromCommits和toCommits
                const fromMessages = new Set(fromCommits.map(c => c.message.trim()));
                const toMessages = new Set(toCommits.map(c => c.message.trim()));
                console.log(`消息集合: from分支${fromMessages.size}个独特消息, to分支${toMessages.size}个独特消息`);
                // 只保留各分支独有的commit message，并且保持作者筛选的结果
                finalFromCommits = fromCommits.filter(c => !toMessages.has(c.message.trim()));
                finalToCommits = toCommits.filter(c => !fromMessages.has(c.message.trim()));
                console.log(`隐藏相同提交后: ${from}分支独有${finalFromCommits.length}个提交, ${to}分支独有${finalToCommits.length}个提交`);
                // 显示最终结果
                vscode.window.showInformationMessage(`🎯 最终结果: ${from}(${finalFromCommits.length}个独有) vs ${to}(${finalToCommits.length}个独有)`);
                // 输出最终结果的作者信息
                if (finalFromCommits.length > 0) {
                    const finalSample = finalFromCommits.slice(0, 3).map(c => c.author).join(', ');
                    console.log(`最终From分支前3个作者: ${finalSample}`);
                    vscode.window.showInformationMessage(`📋 最终样本: ${finalSample}`);
                }
            }
            // 生成比较结果内容
            resultContent = this.generateComparisonContent(from, to, finalFromCommits, finalToCommits, hideIdentical, authorFilter);
            // 显示完成消息
            const message = authorFilter ?
                (hideIdentical ?
                    `✅ 分支比较完成: ${from}(${finalFromCommits.length}个独有) ↔ ${to}(${finalToCommits.length}个独有) [作者: ${authorFilter}]` :
                    `✅ 分支比较完成: ${from}(${finalFromCommits.length}个) ↔ ${to}(${finalToCommits.length}个) [作者: ${authorFilter}]`) :
                (hideIdentical ?
                    `✅ 分支比较完成: ${from}(${finalFromCommits.length}个独有) ↔ ${to}(${finalToCommits.length}个独有)` :
                    `✅ 分支比较完成: ${from}(${finalFromCommits.length}个) ↔ ${to}(${finalToCommits.length}个)`);
            vscode.window.showInformationMessage(message);
            // 创建临时文档显示结果
            const timestamp = Date.now();
            const scheme = `git-comparison-${timestamp}`;
            const fileName = authorFilter ?
                `分支比较-${from}-vs-${to}-作者-${authorFilter}.txt` :
                `分支比较-${from}-vs-${to}.txt`;
            const uri = vscode.Uri.parse(`${scheme}:${fileName}`);
            // 注册虚拟文档提供者
            const provider = new class {
                provideTextDocumentContent() {
                    return resultContent;
                }
            };
            const disposable = vscode.workspace.registerTextDocumentContentProvider(scheme, provider);
            try {
                // 在编辑器中打开比较结果
                const doc = await vscode.workspace.openTextDocument(uri);
                await vscode.window.showTextDocument(doc, { preview: false });
            }
            finally {
                // 延迟清理资源
                setTimeout(() => {
                    disposable.dispose();
                }, 30000); // 30秒后清理
            }
        }
        catch (error) {
            console.error('❌ 分支比较失败:', error);
            vscode.window.showErrorMessage(`分支比较失败: ${error}`);
        }
    }
    generateComparisonContent(fromBranch, toBranch, fromCommits, toCommits, hideIdentical, authorFilter = '') {
        const lines = [];
        // 标题
        let title = hideIdentical ?
            `Git 分支比较结果 (仅显示独有提交)` :
            `Git 分支比较结果`;
        if (authorFilter) {
            title += ` - 作者筛选: ${authorFilter}`;
        }
        lines.push(title);
        lines.push('='.repeat(120));
        lines.push(`起始分支: ${fromBranch} (${fromCommits.length}个提交)    |    结束分支: ${toBranch} (${toCommits.length}个提交)`);
        if (hideIdentical) {
            lines.push('筛选模式: 已隐藏commit message相同的提交');
        }
        if (authorFilter) {
            lines.push(`作者筛选: ${authorFilter}`);
        }
        lines.push(`生成时间: ${new Date().toLocaleString('zh-CN')}`);
        lines.push('');
        lines.push('-'.repeat(120));
        lines.push('');
        // 左右并排显示标题
        const leftTitle = `📍 ${fromBranch} 分支`;
        const rightTitle = `📍 ${toBranch} 分支`;
        const leftPadding = ' '.repeat(60 - leftTitle.length);
        lines.push(`${leftTitle}${leftPadding}|${rightTitle}`);
        lines.push('-'.repeat(60) + '|' + '-'.repeat(60));
        lines.push('');
        // 计算最大行数
        const maxCommits = Math.max(fromCommits.length, toCommits.length);
        if (maxCommits === 0) {
            const leftMsg = hideIdentical ? '没有找到独有的提交' : '没有提交记录';
            const rightMsg = hideIdentical ? '没有找到独有的提交' : '没有提交记录';
            const leftPadding = ' '.repeat(60 - leftMsg.length);
            lines.push(`${leftMsg}${leftPadding}|${rightMsg}`);
            lines.push('');
            return lines.join('\n');
        }
        // 逐行对比显示
        for (let i = 0; i < maxCommits; i++) {
            const leftCommit = i < fromCommits.length ? fromCommits[i] : null;
            const rightCommit = i < toCommits.length ? toCommits[i] : null;
            // 生成左侧内容
            const leftLines = [];
            if (leftCommit) {
                const authorName = leftCommit.author.replace(/<.*>/, '').trim();
                const date = new Date(leftCommit.date).toLocaleDateString('zh-CN');
                const time = new Date(leftCommit.date).toLocaleTimeString('zh-CN', {
                    hour: '2-digit',
                    minute: '2-digit'
                });
                leftLines.push(`${i + 1}. commit ${leftCommit.hash}`);
                leftLines.push(`   作者: ${authorName}  日期: ${date} ${time}`);
                leftLines.push('');
                // 处理多行commit message
                const messageLines = leftCommit.message.split('\n');
                messageLines.forEach((line) => {
                    leftLines.push(`   ${line}`);
                });
            }
            // 生成右侧内容
            const rightLines = [];
            if (rightCommit) {
                const authorName = rightCommit.author.replace(/<.*>/, '').trim();
                const date = new Date(rightCommit.date).toLocaleDateString('zh-CN');
                const time = new Date(rightCommit.date).toLocaleTimeString('zh-CN', {
                    hour: '2-digit',
                    minute: '2-digit'
                });
                rightLines.push(`${i + 1}. commit ${rightCommit.hash}`);
                rightLines.push(`   作者: ${authorName}  日期: ${date} ${time}`);
                rightLines.push('');
                // 处理多行commit message
                const messageLines = rightCommit.message.split('\n');
                messageLines.forEach((line) => {
                    rightLines.push(`   ${line}`);
                });
            }
            // 对齐显示 - 确保左右行数一致
            const maxLines = Math.max(leftLines.length, rightLines.length);
            // 补齐较短的一侧
            while (leftLines.length < maxLines) {
                leftLines.push('');
            }
            while (rightLines.length < maxLines) {
                rightLines.push('');
            }
            for (let j = 0; j < maxLines; j++) {
                const leftLine = leftLines[j];
                const rightLine = rightLines[j];
                // 处理左侧内容，确保占60个字符宽度
                let leftPadded = '';
                if (leftLine.length > 60) {
                    // 如果行太长，需要分割处理
                    const chunks = this.splitLineToChunks(leftLine, 60);
                    // 输出第一行
                    leftPadded = chunks[0] + ' '.repeat(60 - chunks[0].length);
                    lines.push(`${leftPadded}|${rightLine}`);
                    // 输出剩余的左侧行，右侧为空
                    for (let k = 1; k < chunks.length; k++) {
                        const padding = ' '.repeat(60 - chunks[k].length);
                        lines.push(`${chunks[k]}${padding}|`);
                    }
                    continue;
                }
                else {
                    leftPadded = leftLine + ' '.repeat(60 - leftLine.length);
                }
                lines.push(`${leftPadded}|${rightLine}`);
            }
            // 添加分隔线
            lines.push(' '.repeat(60) + '|');
            lines.push('-'.repeat(60) + '|' + '-'.repeat(60));
            lines.push('');
        }
        // 总结
        lines.push('');
        lines.push('='.repeat(120));
        lines.push('📊 比较总结:');
        lines.push(`   ${fromBranch}: ${fromCommits.length} 个提交    |    ${toBranch}: ${toCommits.length} 个提交`);
        if (hideIdentical) {
            lines.push('   说明: 已隐藏两个分支中commit message相同的提交');
        }
        lines.push('');
        lines.push('💡 提示: 可以复制完整的commit ID进行cherry-pick操作');
        return lines.join('\n');
    }
    splitLineToChunks(line, maxWidth) {
        const chunks = [];
        let currentLine = line;
        while (currentLine.length > maxWidth) {
            // 尝试在空格处断行
            let breakPoint = maxWidth;
            for (let i = maxWidth - 1; i >= maxWidth - 20 && i >= 0; i--) {
                if (currentLine[i] === ' ') {
                    breakPoint = i;
                    break;
                }
            }
            chunks.push(currentLine.substring(0, breakPoint));
            currentLine = '   ' + currentLine.substring(breakPoint).trim(); // 续行缩进
        }
        if (currentLine.length > 0) {
            chunks.push(currentLine);
        }
        return chunks;
    }
    async exitCompareMode() {
        this.isCompareMode = false;
        this.compareInfo = { from: '', to: '' };
        console.log('退出比较模式');
        if (this.currentBranch) {
            await this.loadCommits();
        }
        else {
            this.commits = [];
        }
        this.updateWebview();
        vscode.window.showInformationMessage('已退出比较模式');
    }
    async showCommitDetails(hash) {
        try {
            const files = await this.gitService.getCommitFiles(hash);
            const commit = this.commits.find(c => c.hash === hash);
            if (commit) {
                this.sendMessage({
                    type: 'commitDetails',
                    commit: commit,
                    files: files
                });
            }
        }
        catch (error) {
            this.sendMessage({
                type: 'error',
                message: `获取提交详情失败: ${error}`
            });
        }
    }
    async showFileDiff(hash, filePath) {
        try {
            const beforeContent = await this.getFileContentBefore(hash, filePath);
            const afterContent = await this.gitService.getFileContent(hash, filePath);
            const timestamp = Date.now();
            const beforeScheme = `git-before-${timestamp}`;
            const afterScheme = `git-after-${timestamp}`;
            const beforeUri = vscode.Uri.parse(`${beforeScheme}:${hash}~1:${filePath}`);
            const afterUri = vscode.Uri.parse(`${afterScheme}:${hash}:${filePath}`);
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
            const beforeDisposable = vscode.workspace.registerTextDocumentContentProvider(beforeScheme, beforeProvider);
            const afterDisposable = vscode.workspace.registerTextDocumentContentProvider(afterScheme, afterProvider);
            try {
                await vscode.commands.executeCommand('vscode.diff', beforeUri, afterUri, `${filePath} (${hash.substring(0, 8)})`);
            }
            finally {
                setTimeout(() => {
                    beforeDisposable.dispose();
                    afterDisposable.dispose();
                }, 5000);
            }
        }
        catch (error) {
            this.sendMessage({
                type: 'error',
                message: `显示文件差异失败: ${error}`
            });
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
    updateWebview() {
        if (this._view) {
            this.sendMessage({
                type: 'update',
                data: {
                    commits: this.commits,
                    currentBranch: this.currentBranch,
                    branches: this.branches,
                    tags: this.tags,
                    authorFilter: this.authorFilter,
                    messageFilter: this.messageFilter,
                    isCompareMode: this.isCompareMode,
                    compareInfo: this.compareInfo,
                    selectedCommits: Array.from(this.selectedCommits),
                    branchSearchQuery: this.branchSearchQuery
                }
            });
        }
    }
    sendMessage(message) {
        if (this._view) {
            this._view.webview.postMessage(message);
        }
    }
    toggleCommitSelection(hash) {
        if (this.selectedCommits.has(hash)) {
            this.selectedCommits.delete(hash);
        }
        else {
            this.selectedCommits.add(hash);
        }
        this.updateWebview();
    }
    async performInteractiveRebase(selectedHashes) {
        if (selectedHashes.length < 2) {
            this.sendMessage({
                type: 'error',
                message: '请选择至少2个提交进行合并'
            });
            return;
        }
        try {
            const action = await vscode.window.showQuickPick([
                {
                    label: '🔗 合并提交 (squash)',
                    description: '将选中的提交合并为一个',
                    detail: '保留第一个提交消息，其他提交将被合并'
                },
                {
                    label: '✏️ 编辑提交消息',
                    description: '修改提交消息',
                    detail: '允许编辑每个提交的消息'
                },
                {
                    label: '🔄 重新排序',
                    description: '改变提交顺序',
                    detail: '调整提交的先后顺序'
                },
                {
                    label: '🗑️ 删除提交',
                    description: '丢弃选中的提交',
                    detail: '从历史中移除这些提交'
                }
            ], {
                placeHolder: '选择要执行的操作'
            });
            if (action) {
                this.sendMessage({
                    type: 'info',
                    message: `模拟执行: ${action.label} - 已选择${selectedHashes.length}个提交`
                });
                this.selectedCommits.clear();
                this.updateWebview();
            }
        }
        catch (error) {
            this.sendMessage({
                type: 'error',
                message: `交互式rebase失败: ${error}`
            });
        }
    }
    async showBranchPicker() {
        // 用于切换当前分支的可搜索选择器
        const allRefs = [
            ...this.branches.map(b => ({
                label: `🌿 ${b.name}${b.current ? ' (当前)' : ''}`,
                description: b.current ? '当前分支' : '分支',
                value: b.name,
                type: 'branch'
            })),
            ...this.tags.map(t => ({
                label: `🏷️ ${t.name}`,
                description: '标签',
                value: t.name,
                type: 'tag'
            }))
        ];
        const selectedRef = await vscode.window.showQuickPick(allRefs, {
            placeHolder: '选择要切换的分支或标签（可输入关键字搜索）',
            matchOnDetail: true,
            matchOnDescription: true,
            canPickMany: false
        });
        if (selectedRef) {
            await this.switchBranch(selectedRef.value);
        }
    }
    _getHtmlForWebview(webview) {
        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Git Log Explorer</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            font-size: 13px;
            line-height: 1.4;
            overflow-x: hidden;
        }

        .loading {
            display: flex;
            justify-content: center;
            align-items: center;
            height: 200px;
            color: var(--vscode-descriptionForeground);
        }

        .header {
            background: var(--vscode-sideBar-background);
            border-bottom: 1px solid var(--vscode-panel-border);
            padding: 12px;
        }

        .header-row {
            display: flex;
            align-items: center;
            margin-bottom: 8px;
            gap: 8px;
        }

        .header-row:last-child {
            margin-bottom: 0;
        }

        .header-label {
            font-size: 14px;
            min-width: 20px;
        }

        .branch-selector {
            position: relative;
            flex: 1;
            max-width: 200px;
        }

        .branch-input {
            width: 100%;
            padding: 4px 24px 4px 8px;
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 3px;
            color: var(--vscode-input-foreground);
            font-size: 12px;
        }

        .branch-input:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }

        .branch-dropdown-icon {
            position: absolute;
            right: 6px;
            top: 50%;
            transform: translateY(-50%);
            cursor: pointer;
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
        }

        .branch-dropdown {
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            background: var(--vscode-dropdown-background);
            border: 1px solid var(--vscode-dropdown-border);
            border-radius: 3px;
            max-height: 200px;
            overflow-y: auto;
            z-index: 1000;
            display: none;
        }

        .branch-dropdown.show {
            display: block;
        }

        .branch-group-label {
            padding: 4px 8px;
            font-size: 11px;
            font-weight: 500;
            color: var(--vscode-descriptionForeground);
            background: var(--vscode-list-inactiveSelectionBackground);
        }

        .branch-option {
            padding: 4px 8px;
            cursor: pointer;
            font-size: 12px;
        }

        .branch-option:hover {
            background: var(--vscode-list-hoverBackground);
        }

        .branch-option.selected {
            background: var(--vscode-list-activeSelectionBackground);
            color: var(--vscode-list-activeSelectionForeground);
        }

        .filter-input {
            flex: 1;
            padding: 4px 8px;
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 3px;
            color: var(--vscode-input-foreground);
            font-size: 12px;
        }

        .filter-input:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }

        .btn {
            padding: 4px 12px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
        }

        .btn:hover {
            background: var(--vscode-button-hoverBackground);
        }

        .btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .btn-secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }

        .btn-secondary:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }

        .btn-small {
            padding: 2px 8px;
            font-size: 11px;
        }

        .status-bar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 12px;
            background: var(--vscode-statusBar-background);
            border-bottom: 1px solid var(--vscode-panel-border);
            font-size: 11px;
        }

        .status-left, .status-right {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .status-item {
            display: flex;
            align-items: center;
            gap: 4px;
        }

        .status-icon {
            font-size: 10px;
        }

        .commits-container {
            padding: 8px;
            overflow-y: auto;
        }

        .commit-item {
            background: var(--vscode-list-inactiveSelectionBackground);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            margin-bottom: 6px;
            padding: 8px;
            cursor: pointer;
        }

        .commit-item:hover {
            background: var(--vscode-list-hoverBackground);
        }

        .commit-item.selected {
            background: var(--vscode-list-activeSelectionBackground);
            border-color: var(--vscode-focusBorder);
        }

        .commit-header {
            margin-bottom: 4px;
        }

        .commit-title {
            display: flex;
            align-items: center;
            margin-bottom: 4px;
            font-size: 11px;
        }

        .commit-hash {
            font-family: monospace;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 10px;
            margin-right: 8px;
        }

        .commit-author {
            color: var(--vscode-gitDecoration-modifiedResourceForeground);
            margin-right: 8px;
        }

        .commit-date {
            color: var(--vscode-descriptionForeground);
            margin-left: auto;
        }

        .commit-message {
            font-size: 12px;
            font-weight: 500;
            line-height: 1.3;
        }

        .commit-details {
            display: none;
            margin-top: 8px;
            padding-top: 8px;
            border-top: 1px solid var(--vscode-panel-border);
        }

        .commit-details.expanded {
            display: block;
        }

        .commit-checkbox {
            margin-right: 8px;
        }

        .empty-state {
            text-align: center;
            padding: 40px 20px;
            color: var(--vscode-descriptionForeground);
        }

        .empty-icon {
            font-size: 48px;
            margin-bottom: 16px;
            opacity: 0.5;
        }

        .error-message {
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            color: var(--vscode-errorForeground);
            gap: 8px;
        }

        .error-icon {
            font-size: 16px;
        }

        .files-list {
            margin-top: 8px;
        }

        .file-item {
            display: flex;
            align-items: center;
            padding: 4px 8px;
            margin: 2px 0;
            background: var(--vscode-textCodeBlock-background);
            border-radius: 3px;
            cursor: pointer;
            font-size: 11px;
        }

        .file-item:hover {
            background: var(--vscode-list-hoverBackground);
        }

        .file-icon {
            margin-right: 6px;
        }

        .file-path {
            flex: 1;
        }

        /* 模态框样式 */
        .modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: none;
            align-items: center;
            justify-content: center;
            z-index: 2000;
        }

        .modal-overlay.show {
            display: flex;
        }

        .modal {
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            width: 90%;
            max-width: 500px;
            max-height: 80vh;
            overflow: hidden;
        }

        .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 16px 20px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        .modal-title {
            font-size: 16px;
            font-weight: 500;
        }

        .modal-close {
            background: none;
            border: none;
            font-size: 20px;
            cursor: pointer;
            color: var(--vscode-descriptionForeground);
            padding: 0;
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .modal-close:hover {
            background: var(--vscode-list-hoverBackground);
            border-radius: 3px;
        }

        .modal-body {
            padding: 20px;
        }

        .modal-field {
            margin-bottom: 16px;
        }

        .modal-field:last-child {
            margin-bottom: 0;
        }

        .modal-label {
            display: block;
            margin-bottom: 6px;
            font-weight: 500;
            font-size: 13px;
        }

        .modal-footer {
            display: flex;
            justify-content: flex-end;
            gap: 8px;
            padding: 16px 20px;
            border-top: 1px solid var(--vscode-panel-border);
        }
    </style>
</head>
<body>
    <div id="app">
        <div class="loading">正在加载Git数据...</div>
    </div>

    <!-- 比较模式模态框 -->
    <div id="compareModal" class="modal-overlay">
        <div class="modal">
            <div class="modal-header">
                <div class="modal-title">⚖️ 比较分支/标签</div>
                <button class="modal-close" onclick="closeCompareModal()">&times;</button>
            </div>
            <div class="modal-body">
                <div class="modal-field">
                    <label class="modal-label">起始分支/标签:</label>
                    <div class="branch-selector">
                        <input type="text" id="fromBranch" class="branch-input" placeholder="搜索或选择分支/标签...">
                        <span class="branch-dropdown-icon">▼</span>
                        <div id="fromBranchDropdown" class="branch-dropdown"></div>
                    </div>
                </div>
                <div class="modal-field">
                    <label class="modal-label">结束分支/标签:</label>
                    <div class="branch-selector">
                        <input type="text" id="toBranch" class="branch-input" placeholder="搜索或选择分支/标签...">
                        <span class="branch-dropdown-icon">▼</span>
                        <div id="toBranchDropdown" class="branch-dropdown"></div>
                    </div>
                </div>
                <div class="modal-field">
                    <label class="modal-label">
                        <input type="checkbox" id="hideIdentical" style="margin-right: 6px;">
                        只显示不同的提交（隐藏commit message相同的提交）
                    </label>
                </div>
                <div class="modal-field">
                    <label class="modal-label">作者筛选（可选）:</label>
                    <input type="text" id="compareAuthorFilter" class="branch-input" placeholder="输入作者名称进行筛选...">
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="closeCompareModal()">取消</button>
                <button class="btn" onclick="startComparison()">开始比较</button>
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let currentData = {};
        let compareModalData = {};

        // 发送初始化消息
        vscode.postMessage({ type: 'initialize' });

        // 监听来自扩展的消息
        window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.type) {
                case 'update':
                    currentData = message.data;
                    renderApp();
                    break;
                case 'error':
                    renderError(message.message);
                    break;
                case 'commitDetails':
                    showCommitDetails(message.commit, message.files);
                    break;
                case 'showCompareModal':
                    compareModalData = message;
                    showCompareModal();
                    break;
            }
        });

        function renderApp() {
            const app = document.getElementById('app');
            
            app.innerHTML = \`
                <div class="header">
                    <div class="header-row">
                        <span class="header-label">🌿</span>
                        <div class="branch-selector">
                            <input type="text" id="branchSearchInput" class="branch-input" 
                                   placeholder="\${currentData.branches && currentData.branches.length > 0 ? '搜索或选择分支/标签...' : '请输入分支或标签名称'}" 
                                   value="\${currentData.currentBranch || ''}"
                                   oninput="searchBranches(this.value)"
                                   onfocus="handleBranchInputFocus()"
                                   onkeydown="handleBranchInputKeypress(event)">
                            <span class="branch-dropdown-icon" onclick="toggleBranchDropdown()">▼</span>
                            <div id="branchDropdown" class="branch-dropdown">
                                \${renderBranchOptions()}
                            </div>
                        </div>
                        <button class="btn btn-small" onclick="refreshRemoteData()" 
                                title="刷新远程数据">🔄</button>
                        <button class="btn btn-small" onclick="showCompareModalHandler()" 
                                \${(!currentData.branches || currentData.branches.length === 0) ? 'disabled' : ''}>比较</button>
                    </div>
                    
                    <div class="header-row">
                        <span class="header-label">👤</span>
                        <input type="text" class="filter-input" id="authorFilter" 
                               placeholder="筛选作者..." value="\${currentData.authorFilter || ''}"
                               onchange="filterAuthor(this.value)"
                               \${(!currentData.branches || currentData.branches.length === 0) ? 'disabled' : ''}>
                        <span class="header-label">💬</span>
                        <input type="text" class="filter-input" id="messageFilter" 
                               placeholder="筛选消息..." value="\${currentData.messageFilter || ''}"
                               onchange="filterMessage(this.value)"
                               \${(!currentData.branches || currentData.branches.length === 0) ? 'disabled' : ''}>
                        \${(currentData.authorFilter || currentData.messageFilter) ? 
                          '<button class="btn btn-secondary btn-small" onclick="clearFilters()">清除</button>' : ''}
                    </div>
                </div>

                <div class="status-bar">
                    <div class="status-left">
                        <div class="status-item">
                            <span class="status-icon">📊</span>
                            <span>\${currentData.commits ? currentData.commits.length : 0} 个提交</span>
                        </div>
                        \${currentData.selectedCommits && currentData.selectedCommits.length > 0 ? \`
                        <div class="status-item">
                            <span class="status-icon">✅</span>
                            <span>已选择 \${currentData.selectedCommits.length} 个</span>
                        </div>
                        \` : ''}
                        \${currentData.isCompareMode ? \`
                        <div class="status-item">
                            <span class="status-icon">⚖️</span>
                            <span>\${currentData.compareInfo.from} → \${currentData.compareInfo.to}</span>
                        </div>
                        \` : ''}
                    </div>
                    <div class="status-right">
                        \${currentData.selectedCommits && currentData.selectedCommits.length > 1 ? 
                          '<button class="btn btn-small" onclick="performInteractiveRebase()">🔀 合并选中</button>' : ''}
                        \${currentData.isCompareMode ? 
                          '<button class="btn btn-secondary btn-small" onclick="exitCompareMode()">退出比较</button>' : ''}
                    </div>
                </div>

                <div class="commits-container">
                    \${renderCommits()}
                </div>
            \`;

            setupBranchSelector();
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
                    const current = branch.current ? ' (当前)' : '';
                    const selectedClass = branch.name === currentData.currentBranch ? 'selected' : '';
                    options += \`<div class="branch-option \${selectedClass}" onclick="selectBranch('\${branch.name}')">\${branch.name}\${current}</div>\`;
                });
                
                if (showingLimited && filteredBranches.length > 80) {
                    options += \`<div class="branch-group-label">... 还有 \${filteredBranches.length - 80} 个分支（请输入更多字符筛选）</div>\`;
                }
            }

            // 显示标签
            if (filteredTags.length > 0) {
                options += '<div class="branch-group-label">标签</div>';
                const tagsToShow = showingLimited ? filteredTags.slice(0, Math.min(20, filteredTags.length)) : filteredTags;
                
                tagsToShow.forEach(tag => {
                    const selectedClass = tag.name === currentData.currentBranch ? 'selected' : '';
                    options += \`<div class="branch-option \${selectedClass}" onclick="selectBranch('\${tag.name}')">\${tag.name}</div>\`;
                });
                
                if (showingLimited && filteredTags.length > 20) {
                    options += \`<div class="branch-group-label">... 还有 \${filteredTags.length - 20} 个标签（请输入更多字符筛选）</div>\`;
                }
            }

            if (!options) {
                return '<div class="branch-option">无匹配结果</div>';
            }
            
            if (showingLimited) {
                options = '<div class="branch-group-label">⚡ 为提升性能，仅显示前100项，请输入关键字筛选</div>' + options;
            }

            return options;
        }

        function renderCommits() {
            if (!currentData.commits || currentData.commits.length === 0) {
                if (!currentData.branches || currentData.branches.length === 0) {
                    return \`
                        <div class="empty-state">
                            <div class="empty-icon">🌿</div>
                            <div>请选择或输入分支/标签名称</div>
                            <div style="margin-top: 8px; font-size: 11px; color: var(--vscode-descriptionForeground);">
                                在上方输入框中输入分支名称，然后按回车键
                            </div>
                        </div>
                    \`;
                } else if (!currentData.currentBranch) {
                    return \`
                        <div class="empty-state">
                            <div class="empty-icon">📋</div>
                            <div>请选择一个分支或标签</div>
                            <div style="margin-top: 8px; font-size: 11px; color: var(--vscode-descriptionForeground);">
                                点击上方下拉框选择分支，或直接输入分支名称
                            </div>
                        </div>
                    \`;
                } else {
                    return \`
                        <div class="empty-state">
                            <div class="empty-icon">📝</div>
                            <div>暂无提交记录</div>
                            <div style="margin-top: 8px; font-size: 11px; color: var(--vscode-descriptionForeground);">
                                分支 "\${currentData.currentBranch}" 中没有找到提交
                            </div>
                        </div>
                    \`;
                }
            }

            return currentData.commits.map((commit, index) => {
                const shortHash = commit.hash.substring(0, 8);
                const authorName = commit.author.replace(/<.*>/, '').trim();
                const date = new Date(commit.date).toLocaleDateString('zh-CN');
                const time = new Date(commit.date).toLocaleTimeString('zh-CN', { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                });
                const isSelected = currentData.selectedCommits && currentData.selectedCommits.includes(commit.hash);

                return \`
                    <div class="commit-item \${isSelected ? 'selected' : ''}" 
                         onclick="toggleCommitDetails(\${index})"
                         data-hash="\${commit.hash}">
                        <div class="commit-header">
                            <div class="commit-title">
                                <input type="checkbox" class="commit-checkbox" 
                                       \${isSelected ? 'checked' : ''} 
                                       onclick="event.stopPropagation(); toggleCommitSelection('\${commit.hash}')">
                                <span class="commit-hash">\${shortHash}</span>
                                <span class="commit-author">\${authorName}</span>
                                <span class="commit-date">\${date} \${time}</span>
                            </div>
                            <div class="commit-message">\${commit.message}</div>
                        </div>
                        <div class="commit-details" id="details-\${index}">
                            <div>正在加载文件列表...</div>
                        </div>
                    </div>
                \`;
            }).join('');
        }

        function renderError(message) {
            const app = document.getElementById('app');
            app.innerHTML = \`
                <div class="error-message">
                    <span class="error-icon">⚠️</span>
                    <span>\${message}</span>
                </div>
            \`;
        }

        // 分支选择器相关函数
        function setupBranchSelector() {
            const input = document.getElementById('branchSearchInput');
            const dropdown = document.getElementById('branchDropdown');

            if (!input || !dropdown) return;

            // 点击外部关闭下拉框
            document.addEventListener('click', function(event) {
                if (!input.contains(event.target) && !dropdown.contains(event.target)) {
                    dropdown.classList.remove('show');
                }
            });
        }

        function searchBranches(query) {
            const dropdown = document.getElementById('branchDropdown');
            dropdown.innerHTML = renderBranchOptions(query);
            dropdown.classList.add('show');
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

        // 比较模式相关函数
        function showCompareModalHandler() {
            vscode.postMessage({ type: 'showCompareModal' });
        }

        function showCompareModal() {
            const modal = document.getElementById('compareModal');
            modal.classList.add('show');
            
            setupCompareModalBranchSelectors();
        }

        function closeCompareModal() {
            document.getElementById('compareModal').classList.remove('show');
        }

        function setupCompareModalBranchSelectors() {
            const fromInput = document.getElementById('fromBranch');
            const toInput = document.getElementById('toBranch');
            const fromDropdown = document.getElementById('fromBranchDropdown');
            const toDropdown = document.getElementById('toBranchDropdown');

            // 使用上次选择的分支，如果没有则使用当前分支
            fromInput.value = compareModalData.lastCompareFrom || currentData.currentBranch || '';
            toInput.value = compareModalData.lastCompareTo || '';
            
            const branchOptions = renderModalBranchOptions();
            fromDropdown.innerHTML = branchOptions;
            toDropdown.innerHTML = branchOptions;

            // 为模态框的输入框添加事件监听
            setupModalInputEvents(fromInput, fromDropdown);
            setupModalInputEvents(toInput, toDropdown);
        }

        function setupModalInputEvents(input, dropdown) {
            // 输入事件
            input.addEventListener('input', function() {
                dropdown.innerHTML = renderModalBranchOptions(this.value);
                dropdown.classList.add('show');
            });

            // 焦点事件 - 获得焦点时全选文字
            input.addEventListener('focus', function() {
                dropdown.classList.add('show');
                // 全选文字，方便用户直接输入
                setTimeout(() => {
                    this.select();
                }, 50);
            });

            // 点击事件 - 点击时也全选文字
            input.addEventListener('click', function() {
                setTimeout(() => {
                    this.select();
                }, 50);
            });

            // 点击外部关闭下拉框
            document.addEventListener('click', function(event) {
                if (!input.contains(event.target) && !dropdown.contains(event.target)) {
                    dropdown.classList.remove('show');
                }
            });
        }

        function renderModalBranchOptions(searchQuery = '') {
            let options = '';
            const query = searchQuery.toLowerCase();
            const allItems = [
                ...(compareModalData.branches || []).map(b => ({...b, type: 'branch'})),
                ...(compareModalData.tags || []).map(t => ({...t, type: 'tag'}))
            ];

            const filteredItems = allItems.filter(item => 
                item.name.toLowerCase().includes(query)
            );

            if (filteredItems.length === 0) {
                return '<div class="branch-option">无匹配结果</div>';
            }

            const branches = filteredItems.filter(item => item.type === 'branch');
            const tags = filteredItems.filter(item => item.type === 'tag');

            if (branches.length > 0) {
                options += '<div class="branch-group-label">分支</div>';
                branches.forEach(branch => {
                    const current = branch.current ? ' (当前)' : '';
                    options += \`<div class="branch-option" onclick="selectModalBranch(this, '\${branch.name}')">\${branch.name}\${current}</div>\`;
                });
            }

            if (tags.length > 0) {
                options += '<div class="branch-group-label">标签</div>';
                tags.forEach(tag => {
                    options += \`<div class="branch-option" onclick="selectModalBranch(this, '\${tag.name}')">\${tag.name}</div>\`;
                });
            }

            return options;
        }

        function selectModalBranch(element, branchName) {
            const dropdown = element.closest('.branch-dropdown');
            const input = dropdown.previousElementSibling.previousElementSibling;
            input.value = branchName;
            dropdown.classList.remove('show');
        }

        function startComparison() {
            const fromBranch = document.getElementById('fromBranch').value.trim();
            const toBranch = document.getElementById('toBranch').value.trim();
            const hideIdentical = document.getElementById('hideIdentical').checked;
            const authorFilter = document.getElementById('compareAuthorFilter').value.trim();

            if (!fromBranch || !toBranch) {
                alert('请选择起始和结束分支/标签');
                return;
            }

            if (fromBranch === toBranch) {
                alert('起始和结束分支/标签不能相同');
                return;
            }

            closeCompareModal();
            vscode.postMessage({ 
                type: 'compareBranches', 
                from: fromBranch, 
                to: toBranch,
                hideIdentical: hideIdentical,
                authorFilter: authorFilter
            });
        }

        // 其他事件处理函数
        function filterAuthor(author) {
            vscode.postMessage({ type: 'filterAuthor', author: author.trim() });
        }

        function filterMessage(message) {
            vscode.postMessage({ type: 'filterMessage', message: message.trim() });
        }

        function clearFilters() {
            vscode.postMessage({ type: 'clearFilters' });
        }

        function exitCompareMode() {
            vscode.postMessage({ type: 'exitCompareMode' });
        }

        function toggleCommitDetails(index) {
            const details = document.getElementById(\`details-\${index}\`);
            const commit = currentData.commits[index];
            
            if (details.classList.contains('expanded')) {
                details.classList.remove('expanded');
            } else {
                details.classList.add('expanded');
                vscode.postMessage({ type: 'showCommitDetails', hash: commit.hash });
            }
        }

        function showCommitDetails(commit, files) {
            const index = currentData.commits.findIndex(c => c.hash === commit.hash);
            if (index === -1) return;

            const details = document.getElementById(\`details-\${index}\`);
            if (!details) return;

            details.innerHTML = \`
                <div style="margin-bottom: 8px;">
                    <strong>提交详情:</strong> \${commit.hash}
                </div>
                <div class="files-list">
                    <div style="margin-bottom: 6px; font-weight: 500;">修改的文件 (\${files.length}):</div>
                    \${files.map(file => \`
                        <div class="file-item" onclick="event.stopPropagation(); showFileDiff('\${commit.hash}', '\${file}')">
                            <span class="file-icon">📄</span>
                            <span class="file-path">\${file}</span>
                        </div>
                    \`).join('')}
                </div>
            \`;
        }

        function showFileDiff(hash, filePath) {
            vscode.postMessage({ type: 'showFileDiff', hash: hash, filePath: filePath });
        }

        function toggleCommitSelection(hash) {
            vscode.postMessage({ type: 'selectCommit', hash: hash });
        }

        function performInteractiveRebase() {
            if (currentData.selectedCommits.length < 2) {
                vscode.postMessage({
                    type: 'error',
                    message: '请选择至少2个提交进行合并'
                });
                return;
            }

            vscode.postMessage({ 
                type: 'interactiveRebase', 
                commits: currentData.selectedCommits 
            });
        }

        function refreshRemoteData() {
            vscode.postMessage({ type: 'refreshRemote' });
        }
    </script>
</body>
</html>`;
    }
    async refreshRemoteData() {
        try {
            console.log('开始刷新远程数据...');
            // 刷新远程数据
            await this.gitService.refreshFromRemote();
            // 重新加载分支和标签数据
            this.branches = await this.gitService.getBranches();
            this.tags = await this.gitService.getTags();
            // 如果当前有选中的分支，重新加载提交记录
            if (this.currentBranch) {
                await this.loadCommits();
            }
            this.updateWebview();
            console.log('远程数据刷新完成');
        }
        catch (error) {
            console.error('刷新远程数据失败:', error);
            this.sendMessage({
                type: 'error',
                message: `刷新远程数据失败: ${error}`
            });
        }
    }
}
exports.GitLogWebviewProvider = GitLogWebviewProvider;
GitLogWebviewProvider.viewType = 'gitLogExplorer.webview';
//# sourceMappingURL=webviewProvider.js.map