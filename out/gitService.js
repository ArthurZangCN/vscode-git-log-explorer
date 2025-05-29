"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitService = void 0;
const vscode = require("vscode");
const simple_git_1 = require("simple-git");
class GitService {
    constructor() {
        this.git = null;
        this.workspaceRoot = null;
        this.initializeGit();
    }
    initializeGit() {
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            this.workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
            this.git = (0, simple_git_1.simpleGit)(this.workspaceRoot);
        }
    }
    async isGitRepository() {
        if (!this.git || !this.workspaceRoot) {
            return false;
        }
        try {
            await this.git.status();
            return true;
        }
        catch (error) {
            return false;
        }
    }
    async getCurrentBranch() {
        if (!this.git) {
            throw new Error('Git not initialized');
        }
        const status = await this.git.status();
        return status.current || 'HEAD';
    }
    async getBranches() {
        if (!this.git) {
            throw new Error('Git not initialized');
        }
        try {
            // 获取当前分支
            const status = await this.git.status();
            const currentBranch = status.current || '';
            // 使用 git for-each-ref 批量获取所有分支信息
            const localResult = await this.git.raw(['for-each-ref', '--format=%(refname:short)', 'refs/heads']);
            const remoteResult = await this.git.raw(['for-each-ref', '--format=%(refname:short)', 'refs/remotes/origin']);
            const branches = [];
            const localBranchNames = new Set();
            // 处理本地分支
            if (localResult.trim()) {
                const localBranches = localResult.trim().split('\n');
                for (const branchName of localBranches) {
                    if (branchName) {
                        localBranchNames.add(branchName);
                        branches.push({
                            name: branchName,
                            current: branchName === currentBranch,
                            type: 'local'
                        });
                    }
                }
            }
            // 处理远程分支（只添加不在本地的）
            if (remoteResult.trim()) {
                const remoteBranches = remoteResult.trim().split('\n');
                for (const fullBranchName of remoteBranches) {
                    if (fullBranchName && !fullBranchName.includes('HEAD')) {
                        const branchName = fullBranchName.replace('origin/', '');
                        // 只添加本地没有的远程分支
                        if (!localBranchNames.has(branchName)) {
                            branches.push({
                                name: branchName,
                                current: false,
                                type: 'remote'
                            });
                        }
                    }
                }
            }
            // 简单按名称排序，不获取时间信息
            branches.sort((a, b) => {
                // 当前分支排在最前面
                if (a.current && !b.current)
                    return -1;
                if (!a.current && b.current)
                    return 1;
                // 本地分支优先于远程分支
                if (a.type === 'local' && b.type === 'remote')
                    return -1;
                if (a.type === 'remote' && b.type === 'local')
                    return 1;
                // 按名称排序
                return a.name.localeCompare(b.name);
            });
            return branches;
        }
        catch (error) {
            console.warn('GitService: 批量获取分支失败，回退到原方法:', error);
            // 回退到原方法
            const branchSummary = await this.git.branch(['-a']);
            const branches = [];
            // 本地分支
            for (const branchName of Object.keys(branchSummary.branches)) {
                if (!branchName.startsWith('remotes/')) {
                    branches.push({
                        name: branchName,
                        current: branchSummary.current === branchName,
                        type: 'local'
                    });
                }
            }
            // 远程分支（只添加不在本地的）
            for (const branchName of Object.keys(branchSummary.branches)) {
                if (branchName.startsWith('remotes/origin/') && !branchName.includes('HEAD')) {
                    const cleanName = branchName.replace('remotes/origin/', '');
                    // 检查是否已经有同名本地分支
                    const hasLocalBranch = branches.some(b => b.name === cleanName);
                    if (!hasLocalBranch) {
                        branches.push({
                            name: cleanName,
                            current: false,
                            type: 'remote'
                        });
                    }
                }
            }
            // 简单按名称排序，不获取时间信息
            branches.sort((a, b) => {
                // 当前分支排在最前面
                if (a.current && !b.current)
                    return -1;
                if (!a.current && b.current)
                    return 1;
                // 本地分支优先于远程分支
                if (a.type === 'local' && b.type === 'remote')
                    return -1;
                if (a.type === 'remote' && b.type === 'local')
                    return 1;
                // 按名称排序
                return a.name.localeCompare(b.name);
            });
            return branches;
        }
    }
    async getTags() {
        if (!this.git) {
            throw new Error('Git not initialized');
        }
        try {
            // 使用 git for-each-ref 批量获取所有标签信息，包括hash
            const result = await this.git.raw(['for-each-ref', '--format=%(refname:short) %(objectname)', 'refs/tags']);
            const tags = [];
            if (result.trim()) {
                const lines = result.trim().split('\n');
                for (const line of lines) {
                    const [name, hash] = line.split(' ');
                    if (name && hash) {
                        tags.push({
                            name: name,
                            hash: hash
                        });
                    }
                }
            }
            // 简单按名称排序，不获取时间信息
            tags.sort((a, b) => a.name.localeCompare(b.name));
            return tags;
        }
        catch (error) {
            console.warn('GitService: 批量获取标签失败，回退到原方法:', error);
            // 回退到原方法
            const tagResult = await this.git.tags();
            const tags = [];
            for (const tagName of tagResult.all) {
                try {
                    const hash = await this.git.revparse([tagName]);
                    tags.push({
                        name: tagName,
                        hash: hash
                    });
                }
                catch (error) {
                    // 忽略无效的标签
                }
            }
            // 简单按名称排序，不获取时间信息
            tags.sort((a, b) => a.name.localeCompare(b.name));
            return tags;
        }
    }
    async getCommits(branchOrTag, maxCount = 50) {
        if (!this.git) {
            throw new Error('Git not initialized');
        }
        try {
            console.log(`GitService: 获取分支/标签 ${branchOrTag} 的提交记录，最大数量: ${maxCount}`);
            // 确定要查询的引用 - 优先使用远程版本
            let refToQuery = branchOrTag;
            // 优先尝试远程分支，确保使用服务器最新版本
            try {
                await this.git.revparse([`origin/${branchOrTag}`]);
                refToQuery = `origin/${branchOrTag}`;
                console.log(`GitService: 使用远程分支: origin/${branchOrTag}`);
            }
            catch (remoteError) {
                // 如果远程分支不存在，尝试本地分支/标签
                try {
                    await this.git.revparse([branchOrTag]);
                    refToQuery = branchOrTag;
                    console.log(`GitService: 远程分支不存在，使用本地引用: ${branchOrTag}`);
                }
                catch (localError) {
                    // 如果都不存在，使用原始名称（可能是标签）
                    refToQuery = branchOrTag;
                    console.log(`GitService: 使用原始引用: ${branchOrTag}`);
                }
            }
            console.log(`GitService: 查询引用: ${refToQuery}`);
            // 使用正确的simple-git语法，直接传递分支名作为from参数
            const logResult = await this.git.log([refToQuery, '--max-count=' + maxCount]);
            console.log(`GitService: 获取到 ${logResult.all.length} 个提交`);
            const commits = logResult.all.map((commit) => ({
                hash: commit.hash,
                date: commit.date,
                message: commit.message,
                author: `${commit.author_name} <${commit.author_email}>`,
                email: commit.author_email
            }));
            return commits;
        }
        catch (error) {
            console.error(`GitService: 获取分支/标签 ${branchOrTag} 的提交失败:`, error);
            throw error;
        }
    }
    async refreshFromRemote() {
        if (!this.git) {
            throw new Error('Git not initialized');
        }
        try {
            console.log('GitService: 手动刷新远程数据...');
            // 首先检查是否有远程仓库配置
            const remotes = await this.git.getRemotes(true);
            if (remotes.length === 0) {
                console.log('GitService: 没有配置远程仓库，跳过刷新');
                vscode.window.showInformationMessage('ℹ️ 当前仓库没有配置远程仓库');
                return;
            }
            // 检查是否有origin远程仓库
            const originRemote = remotes.find(remote => remote.name === 'origin');
            if (!originRemote) {
                console.log('GitService: 没有找到origin远程仓库，跳过刷新');
                vscode.window.showInformationMessage('ℹ️ 没有找到origin远程仓库');
                return;
            }
            console.log(`GitService: 找到远程仓库 origin: ${originRemote.refs.fetch}`);
            // 尝试获取远程分支和标签的最新数据
            try {
                await this.git.fetch(['origin', '--tags']);
                console.log('GitService: 远程数据刷新完成');
                vscode.window.showInformationMessage('✅ 远程数据刷新完成');
            }
            catch (fetchError) {
                console.warn('GitService: fetch失败，可能是权限问题:', fetchError);
                // 检查是否是权限相关的错误
                const errorMessage = fetchError.message || fetchError.toString();
                if (errorMessage.includes('Permission denied') ||
                    errorMessage.includes('publickey') ||
                    errorMessage.includes('access rights')) {
                    vscode.window.showWarningMessage('⚠️ 无法访问远程仓库，可能是SSH密钥或权限问题。将使用本地缓存的远程分支信息。');
                }
                else if (errorMessage.includes('Could not resolve hostname') ||
                    errorMessage.includes('network')) {
                    vscode.window.showWarningMessage('⚠️ 网络连接问题，无法刷新远程数据。将使用本地缓存的远程分支信息。');
                }
                else {
                    vscode.window.showWarningMessage(`⚠️ 刷新远程数据失败: ${errorMessage}。将使用本地缓存的远程分支信息。`);
                }
                // 不抛出错误，继续使用本地缓存的远程分支信息
                console.log('GitService: 使用本地缓存的远程分支信息');
            }
        }
        catch (error) {
            console.error('GitService: 刷新远程数据失败:', error);
            const errorMessage = error.message || error.toString();
            vscode.window.showErrorMessage(`刷新远程数据失败: ${errorMessage}`);
            throw error;
        }
    }
    async fetchRemoteData() {
        if (!this.git) {
            return;
        }
        try {
            console.log('GitService: 从远程获取最新数据...');
            // 获取远程分支和标签的最新数据
            await this.git.fetch(['--all', '--tags']);
            console.log('GitService: 远程数据获取完成');
        }
        catch (error) {
            console.warn('GitService: 获取远程数据失败，使用本地数据:', error);
            // 如果fetch失败，继续使用本地数据
        }
    }
    async getCommitFiles(commitHash) {
        if (!this.git) {
            throw new Error('Git not initialized');
        }
        try {
            const result = await this.git.show(['--name-only', '--pretty=format:', commitHash]);
            return result.split('\n').filter((line) => line.trim() !== '');
        }
        catch (error) {
            vscode.window.showErrorMessage(`Failed to get commit files: ${error}`);
            return [];
        }
    }
    async getCommitDiff(commitHash, filePath) {
        if (!this.git) {
            throw new Error('Git not initialized');
        }
        try {
            if (filePath) {
                return await this.git.show([commitHash, '--', filePath]);
            }
            else {
                return await this.git.show([commitHash]);
            }
        }
        catch (error) {
            vscode.window.showErrorMessage(`Failed to get commit diff: ${error}`);
            return '';
        }
    }
    async getFileContent(commitHash, filePath) {
        if (!this.git) {
            throw new Error('Git not initialized');
        }
        try {
            return await this.git.show([`${commitHash}:${filePath}`]);
        }
        catch (error) {
            vscode.window.showErrorMessage(`Failed to get file content: ${error}`);
            return '';
        }
    }
    async compareCommits(from, to) {
        if (!this.git) {
            throw new Error('Git not initialized');
        }
        try {
            console.log(`GitService: 比较分支 ${from} 和 ${to}`);
            // 使用git log的范围语法来比较两个分支
            const logResult = await this.git.log([`${from}..${to}`, '--max-count=100']);
            console.log(`GitService: 比较结果包含 ${logResult.all.length} 个提交`);
            const commits = logResult.all.map((commit) => ({
                hash: commit.hash,
                date: commit.date,
                message: commit.message,
                author: commit.author_name,
                email: commit.author_email
            }));
            return commits;
        }
        catch (error) {
            console.error(`GitService: 比较分支失败:`, error);
            throw error;
        }
    }
    async filterCommits(branchOrTag, authorFilter, messageFilter, maxCount = 50) {
        if (!this.git) {
            throw new Error('Git not initialized');
        }
        try {
            console.log(`GitService: 筛选分支 ${branchOrTag} 的提交，作者: ${authorFilter}, 消息: ${messageFilter}`);
            // 使用simple-git的log方法，然后手动筛选
            const logResult = await this.git.log([branchOrTag, '--max-count=' + maxCount]);
            const allCommits = logResult.all.map((commit) => ({
                hash: commit.hash,
                date: commit.date,
                message: commit.message,
                author: commit.author_name,
                email: commit.author_email
            }));
            // 手动筛选
            let filteredCommits = allCommits;
            if (authorFilter) {
                filteredCommits = filteredCommits.filter(commit => commit.author.toLowerCase().includes(authorFilter.toLowerCase()) ||
                    commit.email.toLowerCase().includes(authorFilter.toLowerCase()));
            }
            if (messageFilter) {
                filteredCommits = filteredCommits.filter(commit => commit.message.toLowerCase().includes(messageFilter.toLowerCase()));
            }
            console.log(`GitService: 筛选后得到 ${filteredCommits.length} 个提交`);
            return filteredCommits;
        }
        catch (error) {
            console.error(`GitService: 筛选提交失败:`, error);
            throw error;
        }
    }
    getWorkspaceRoot() {
        return this.workspaceRoot;
    }
    /**
     * 获取两个分支之间的差异提交
     * 只返回在目标分支中存在但在源分支中不存在的提交
     */
    async getBranchDifference(fromBranch, toBranch) {
        try {
            console.log(`🔍 获取分支差异: ${fromBranch} vs ${toBranch}`);
            // 获取两个分支的提交
            const fromCommits = await this.getCommits(fromBranch, 200);
            const toCommits = await this.getCommits(toBranch, 200);
            console.log(`📊 ${fromBranch}: ${fromCommits.length} 个提交`);
            console.log(`📊 ${toBranch}: ${toCommits.length} 个提交`);
            // 创建提交映射，用于快速查找
            const fromCommitMap = new Map(fromCommits.map(c => [c.hash, c]));
            const toCommitMap = new Map(toCommits.map(c => [c.hash, c]));
            // 找出只在源分支中存在的提交
            const onlyInFrom = fromCommits.filter(commit => !toCommitMap.has(commit.hash));
            // 找出只在目标分支中存在的提交
            const onlyInTo = toCommits.filter(commit => !fromCommitMap.has(commit.hash));
            // 找出提交说明不同的记录（相同hash但不同message）
            const different = [];
            for (const fromCommit of fromCommits) {
                const toCommit = toCommitMap.get(fromCommit.hash);
                if (toCommit && fromCommit.message !== toCommit.message) {
                    different.push({
                        hash: fromCommit.hash,
                        fromMessage: fromCommit.message,
                        toMessage: toCommit.message,
                        author: fromCommit.author,
                        date: fromCommit.date
                    });
                }
            }
            console.log(`📈 差异统计:`, {
                onlyInFrom: onlyInFrom.length,
                onlyInTo: onlyInTo.length,
                different: different.length
            });
            return {
                onlyInFrom,
                onlyInTo,
                different
            };
        }
        catch (error) {
            console.error('❌ 获取分支差异失败:', error);
            throw error;
        }
    }
}
exports.GitService = GitService;
//# sourceMappingURL=gitService.js.map