import * as vscode from 'vscode';
import { simpleGit, SimpleGit, BranchSummary, TagResult } from 'simple-git';
import * as path from 'path';

export interface GitCommit {
    hash: string;
    date: string;
    message: string;
    author: string;
    files?: string[];
}

export interface GitBranch {
    name: string;
    current: boolean;
    type: 'local' | 'remote';
    lastCommitDate?: string;
}

export interface GitTag {
    name: string;
    hash: string;
    lastCommitDate?: string;
}

export class GitService {
    private git: SimpleGit | null = null;
    private workspaceRoot: string | null = null;

    constructor() {
        this.initializeGit();
    }

    private initializeGit(): void {
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            this.workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
            this.git = simpleGit(this.workspaceRoot);
        }
    }

    public async isGitRepository(): Promise<boolean> {
        if (!this.git || !this.workspaceRoot) {
            return false;
        }

        try {
            await this.git.status();
            return true;
        } catch (error) {
            return false;
        }
    }

    public async getCurrentBranch(): Promise<string> {
        if (!this.git) {
            throw new Error('Git not initialized');
        }

        const status = await this.git.status();
        return status.current || 'HEAD';
    }

    public async getBranches(): Promise<GitBranch[]> {
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
            
            const branches: GitBranch[] = [];
            const localBranchNames = new Set<string>();

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
                if (a.current && !b.current) return -1;
                if (!a.current && b.current) return 1;
                // 本地分支优先于远程分支
                if (a.type === 'local' && b.type === 'remote') return -1;
                if (a.type === 'remote' && b.type === 'local') return 1;
                // 按名称排序
                return a.name.localeCompare(b.name);
            });

            return branches;
        } catch (error) {
            console.warn('GitService: 批量获取分支失败，回退到原方法:', error);
            
            // 回退到原方法
            const branchSummary: BranchSummary = await this.git.branch(['-a']);
            const branches: GitBranch[] = [];

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
                if (a.current && !b.current) return -1;
                if (!a.current && b.current) return 1;
                // 本地分支优先于远程分支
                if (a.type === 'local' && b.type === 'remote') return -1;
                if (a.type === 'remote' && b.type === 'local') return 1;
                // 按名称排序
                return a.name.localeCompare(b.name);
            });

            return branches;
        }
    }

    public async getTags(): Promise<GitTag[]> {
        if (!this.git) {
            throw new Error('Git not initialized');
        }

        try {
            // 使用 git for-each-ref 批量获取所有标签信息，包括hash
            const result = await this.git.raw(['for-each-ref', '--format=%(refname:short) %(objectname)', 'refs/tags']);
            const tags: GitTag[] = [];

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
        } catch (error) {
            console.warn('GitService: 批量获取标签失败，回退到原方法:', error);
            
            // 回退到原方法
            const tagResult: TagResult = await this.git.tags();
            const tags: GitTag[] = [];

            for (const tagName of tagResult.all) {
                try {
                    const hash = await this.git.revparse([tagName]);
                    tags.push({
                        name: tagName,
                        hash: hash
                    });
                } catch (error) {
                    // 忽略无效的标签
                }
            }

            // 简单按名称排序，不获取时间信息
            tags.sort((a, b) => a.name.localeCompare(b.name));

            return tags;
        }
    }

    public async getCommits(branchOrTag: string, maxCount: number = 50): Promise<GitCommit[]> {
        if (!this.git) {
            throw new Error('Git not initialized');
        }

        try {
            console.log(`GitService: 获取分支/标签 ${branchOrTag} 的提交记录，最大数量: ${maxCount}`);
            
            // 确定要查询的引用 - 比较远程和本地版本，使用最新的
            let refToQuery = branchOrTag;
            let useRemote = false;
            
            try {
                // 检查远程分支是否存在
                const remoteRef = `origin/${branchOrTag}`;
                await this.git.revparse([remoteRef]);
                
                try {
                    // 检查本地分支是否存在
                    await this.git.revparse([branchOrTag]);
                    
                    // 如果本地和远程都存在，比较哪个更新
                    const localCommit = await this.git.revparse([branchOrTag]);
                    const remoteCommit = await this.git.revparse([remoteRef]);
                    
                    if (localCommit !== remoteCommit) {
                        // 检查哪个分支更新（包含更多提交）
                        try {
                            const mergeBase = await this.git.raw(['merge-base', branchOrTag, remoteRef]);
                            const localAhead = await this.git.raw(['rev-list', '--count', `${mergeBase.trim()}..${branchOrTag}`]);
                            const remoteAhead = await this.git.raw(['rev-list', '--count', `${mergeBase.trim()}..${remoteRef}`]);
                            
                            const localAheadCount = parseInt(localAhead.trim()) || 0;
                            const remoteAheadCount = parseInt(remoteAhead.trim()) || 0;
                            
                            if (remoteAheadCount > 0) {
                                // 远程有新提交，使用远程版本
                                refToQuery = remoteRef;
                                useRemote = true;
                                console.log(`GitService: 远程分支有 ${remoteAheadCount} 个新提交，使用远程版本: ${remoteRef}`);
                            } else if (localAheadCount > 0) {
                                // 本地有新提交，使用本地版本
                                refToQuery = branchOrTag;
                                console.log(`GitService: 本地分支有 ${localAheadCount} 个新提交，使用本地版本: ${branchOrTag}`);
                            } else {
                                // 相同，优先使用远程版本
                                refToQuery = remoteRef;
                                useRemote = true;
                                console.log(`GitService: 本地和远程版本相同，使用远程版本: ${remoteRef}`);
                            }
                        } catch (compareError) {
                            // 比较失败，优先使用远程版本
                            refToQuery = remoteRef;
                            useRemote = true;
                            console.log(`GitService: 无法比较版本，使用远程版本: ${remoteRef}`);
                        }
                    } else {
                        // 本地和远程指向同一个提交，优先使用远程版本
                        refToQuery = remoteRef;
                        useRemote = true;
                        console.log(`GitService: 本地和远程指向同一提交，使用远程版本: ${remoteRef}`);
                    }
                } catch (localError) {
                    // 本地分支不存在，使用远程分支
                    refToQuery = remoteRef;
                    useRemote = true;
                    console.log(`GitService: 本地分支不存在，使用远程分支: ${remoteRef}`);
                }
            } catch (remoteError) {
                // 远程分支不存在，尝试本地分支/标签
                try {
                    await this.git.revparse([branchOrTag]);
                    refToQuery = branchOrTag;
                    console.log(`GitService: 远程分支不存在，使用本地引用: ${branchOrTag}`);
                } catch (localError) {
                    // 如果都不存在，使用原始名称（可能是标签）
                    refToQuery = branchOrTag;
                    console.log(`GitService: 本地和远程都不存在，使用原始引用: ${branchOrTag}`);
                }
            }

            console.log(`GitService: 最终查询引用: ${refToQuery} (使用${useRemote ? '远程' : '本地'}版本)`);
            
            // 使用正确的simple-git语法，直接传递分支名作为from参数
            const logResult = await this.git.log([refToQuery, '--max-count=' + maxCount]);

            console.log(`GitService: 获取到 ${logResult.all.length} 个提交`);

            const commits = logResult.all.map((commit: any) => ({
                hash: commit.hash,
                date: commit.date,
                message: commit.message,
                author: `${commit.author_name} <${commit.author_email}>`,
                email: commit.author_email
            }));

            return commits;
        } catch (error) {
            console.error(`GitService: 获取分支/标签 ${branchOrTag} 的提交失败:`, error);
            throw error;
        }
    }

    public async refreshFromRemote(): Promise<void> {
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
            } catch (fetchError: any) {
                console.warn('GitService: fetch失败，可能是权限问题:', fetchError);
                
                // 检查是否是权限相关的错误
                const errorMessage = fetchError.message || fetchError.toString();
                if (errorMessage.includes('Permission denied') || 
                    errorMessage.includes('publickey') || 
                    errorMessage.includes('access rights')) {
                    vscode.window.showWarningMessage('⚠️ 无法访问远程仓库，可能是SSH密钥或权限问题。将使用本地缓存的远程分支信息。');
                } else if (errorMessage.includes('Could not resolve hostname') || 
                          errorMessage.includes('network')) {
                    vscode.window.showWarningMessage('⚠️ 网络连接问题，无法刷新远程数据。将使用本地缓存的远程分支信息。');
                } else {
                    vscode.window.showWarningMessage(`⚠️ 刷新远程数据失败: ${errorMessage}。将使用本地缓存的远程分支信息。`);
                }
                
                // 不抛出错误，继续使用本地缓存的远程分支信息
                console.log('GitService: 使用本地缓存的远程分支信息');
            }
        } catch (error: any) {
            console.error('GitService: 刷新远程数据失败:', error);
            const errorMessage = error.message || error.toString();
            vscode.window.showErrorMessage(`刷新远程数据失败: ${errorMessage}`);
            throw error;
        }
    }

    private async fetchRemoteData(): Promise<void> {
        if (!this.git) {
            return;
        }

        try {
            console.log('GitService: 从远程获取最新数据...');
            // 获取远程分支和标签的最新数据
            await this.git.fetch(['--all', '--tags']);
            console.log('GitService: 远程数据获取完成');
        } catch (error) {
            console.warn('GitService: 获取远程数据失败，使用本地数据:', error);
            // 如果fetch失败，继续使用本地数据
        }
    }

    public async getCommitFiles(commitHash: string): Promise<string[]> {
        if (!this.git) {
            throw new Error('Git not initialized');
        }

        try {
            const result = await this.git.show(['--name-only', '--pretty=format:', commitHash]);
            return result.split('\n').filter((line: string) => line.trim() !== '');
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to get commit files: ${error}`);
            return [];
        }
    }

    public async getCommitDiff(commitHash: string, filePath?: string): Promise<string> {
        if (!this.git) {
            throw new Error('Git not initialized');
        }

        try {
            if (filePath) {
                return await this.git.show([commitHash, '--', filePath]);
            } else {
                return await this.git.show([commitHash]);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to get commit diff: ${error}`);
            return '';
        }
    }

    public async getFileContent(commitHash: string, filePath: string): Promise<string> {
        if (!this.git) {
            throw new Error('Git not initialized');
        }

        try {
            return await this.git.show([`${commitHash}:${filePath}`]);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to get file content: ${error}`);
            return '';
        }
    }

    public async compareCommits(from: string, to: string): Promise<GitCommit[]> {
        if (!this.git) {
            throw new Error('Git not initialized');
        }

        try {
            console.log(`GitService: 比较分支 ${from} 和 ${to}`);
            
            // 使用git log的范围语法来比较两个分支
            const logResult = await this.git.log([`${from}..${to}`, '--max-count=100']);

            console.log(`GitService: 比较结果包含 ${logResult.all.length} 个提交`);

            const commits = logResult.all.map((commit: any) => ({
                hash: commit.hash,
                date: commit.date,
                message: commit.message,
                author: commit.author_name,
                email: commit.author_email
            }));

            return commits;
        } catch (error) {
            console.error(`GitService: 比较分支失败:`, error);
            throw error;
        }
    }

    public async filterCommits(
        branchOrTag: string,
        authorFilter?: string,
        messageFilter?: string,
        maxCount: number = 50
    ): Promise<GitCommit[]> {
        if (!this.git) {
            throw new Error('Git not initialized');
        }

        try {
            console.log(`GitService: 筛选分支 ${branchOrTag} 的提交，作者: ${authorFilter}, 消息: ${messageFilter}`);
            
            // 使用simple-git的log方法，然后手动筛选
            const logResult = await this.git.log([branchOrTag, '--max-count=' + maxCount]);

            const allCommits = logResult.all.map((commit: any) => ({
                hash: commit.hash,
                date: commit.date,
                message: commit.message,
                author: commit.author_name,
                email: commit.author_email
            }));

            // 手动筛选
            let filteredCommits = allCommits;

            if (authorFilter) {
                filteredCommits = filteredCommits.filter(commit => 
                    commit.author.toLowerCase().includes(authorFilter.toLowerCase()) ||
                    commit.email.toLowerCase().includes(authorFilter.toLowerCase())
                );
            }

            if (messageFilter) {
                filteredCommits = filteredCommits.filter(commit => 
                    commit.message.toLowerCase().includes(messageFilter.toLowerCase())
                );
            }

            console.log(`GitService: 筛选后得到 ${filteredCommits.length} 个提交`);
            return filteredCommits;
        } catch (error) {
            console.error(`GitService: 筛选提交失败:`, error);
            throw error;
        }
    }

    public getWorkspaceRoot(): string | null {
        return this.workspaceRoot;
    }

    /**
     * 获取两个分支之间的差异提交
     * 只返回在目标分支中存在但在源分支中不存在的提交
     */
    async getBranchDifference(fromBranch: string, toBranch: string): Promise<{
        onlyInFrom: any[],
        onlyInTo: any[],
        different: any[]
    }> {
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
            const different: any[] = [];
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
            
        } catch (error) {
            console.error('❌ 获取分支差异失败:', error);
            throw error;
        }
    }
}