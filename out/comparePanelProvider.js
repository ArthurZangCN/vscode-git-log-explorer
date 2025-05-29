"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ComparePanelProvider = void 0;
class ComparePanelProvider {
    constructor(_extensionUri, gitService) {
        this._extensionUri = _extensionUri;
        this.gitService = gitService;
        console.log('🏗️ ComparePanelProvider 构造函数被调用');
    }
    // 添加公共方法检查面板状态
    isViewReady() {
        const ready = !!this._view;
        console.log('🔍 面板视图状态检查:', ready ? '✅ 已就绪' : '❌ 未就绪');
        return ready;
    }
    resolveWebviewView(webviewView, context, _token) {
        console.log('🎯 ComparePanelProvider.resolveWebviewView 被调用了！');
        console.log('📋 Context:', {
            state: context.state,
            viewType: webviewView.viewType
        });
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };
        // 设置简单的HTML内容来测试
        webviewView.webview.html = this.getSimpleHtml();
        console.log('✅ 面板视图HTML已设置');
        // 监听视图状态变化
        webviewView.onDidChangeVisibility(() => {
            console.log('👁️ 面板视图可见性变化:', webviewView.visible ? '显示' : '隐藏');
        });
        webviewView.onDidDispose(() => {
            console.log('🗑️ 面板视图被销毁');
            this._view = undefined;
        });
    }
    getSimpleHtml() {
        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Git Branch Comparison</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            padding: 20px;
            margin: 0;
        }
        .test-container {
            text-align: center;
            padding: 40px 20px;
        }
        .success-icon {
            font-size: 48px;
            margin-bottom: 20px;
        }
        .title {
            font-size: 24px;
            font-weight: bold;
            margin-bottom: 10px;
        }
        .subtitle {
            color: var(--vscode-descriptionForeground);
            margin-bottom: 20px;
        }
        .info {
            background: var(--vscode-textBlockQuote-background);
            border-left: 4px solid var(--vscode-textBlockQuote-border);
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
        }
    </style>
</head>
<body>
    <div class="test-container">
        <div class="success-icon">🎉</div>
        <div class="title">面板视图测试成功！</div>
        <div class="subtitle">Git Branch Comparison 面板已正常加载</div>
        
        <div class="info">
            <strong>✅ 测试结果：</strong><br>
            • 面板视图已成功创建<br>
            • resolveWebviewView 方法已被调用<br>
            • HTML内容正常显示<br>
            • 这证明面板视图配置是正确的
        </div>
        
        <div style="margin-top: 30px; font-size: 14px; color: var(--vscode-descriptionForeground);">
            如果你能看到这个消息，说明面板视图工作正常！<br>
            现在可以添加比较功能了。
        </div>
    </div>
</body>
</html>`;
    }
    async showComparison(from, to) {
        console.log('🔄 showComparison 被调用:', from, 'vs', to);
        if (!this._view) {
            console.error('❌ _view 不存在，无法显示比较结果');
            return;
        }
        try {
            // 获取比较数据
            const fromCommits = await this.gitService.getCommits(from, 50);
            const toCommits = await this.gitService.getCommits(to, 50);
            console.log('📊 比较数据获取成功:', {
                from: `${from} (${fromCommits.length} commits)`,
                to: `${to} (${toCommits.length} commits)`
            });
            // 更新webview内容
            this._view.webview.html = this.getComparisonHtml(from, to, fromCommits, toCommits);
            console.log('✅ 比较结果已更新到面板');
        }
        catch (error) {
            console.error('❌ 显示比较结果失败:', error);
            this._view.webview.html = this.getErrorHtml(error);
        }
    }
    getComparisonHtml(from, to, fromCommits, toCommits) {
        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Git Branch Comparison</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            margin: 0;
            padding: 0;
        }
        .header {
            background: var(--vscode-sideBar-background);
            border-bottom: 1px solid var(--vscode-panel-border);
            padding: 15px;
            text-align: center;
        }
        .title {
            font-size: 16px;
            font-weight: bold;
            margin-bottom: 5px;
        }
        .subtitle {
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
        }
        .comparison-container {
            display: flex;
            height: calc(100vh - 80px);
        }
        .branch-panel {
            flex: 1;
            border-right: 1px solid var(--vscode-panel-border);
            overflow-y: auto;
        }
        .branch-panel:last-child {
            border-right: none;
        }
        .branch-header {
            background: var(--vscode-list-inactiveSelectionBackground);
            padding: 10px 15px;
            border-bottom: 1px solid var(--vscode-panel-border);
            font-weight: bold;
            position: sticky;
            top: 0;
            z-index: 10;
        }
        .commit-list {
            padding: 10px;
        }
        .commit-item {
            background: var(--vscode-list-inactiveSelectionBackground);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            margin-bottom: 8px;
            padding: 10px;
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
        .commit-message {
            margin: 5px 0;
            font-weight: 500;
        }
        .commit-author {
            color: var(--vscode-gitDecoration-modifiedResourceForeground);
            font-size: 10px;
        }
        .commit-date {
            color: var(--vscode-descriptionForeground);
            font-size: 10px;
            float: right;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="title">⚖️ Git 分支比较</div>
        <div class="subtitle">${from} ↔ ${to}</div>
    </div>
    
    <div class="comparison-container">
        <div class="branch-panel">
            <div class="branch-header">
                🌿 ${from} (${fromCommits.length} 个提交)
            </div>
            <div class="commit-list">
                ${fromCommits.map(commit => `
                    <div class="commit-item">
                        <div>
                            <span class="commit-hash">${commit.hash.substring(0, 8)}</span>
                            <span class="commit-date">${new Date(commit.date).toLocaleDateString('zh-CN')}</span>
                        </div>
                        <div class="commit-message">${commit.message}</div>
                        <div class="commit-author">👤 ${commit.author.replace(/<.*>/, '').trim()}</div>
                    </div>
                `).join('')}
            </div>
        </div>
        
        <div class="branch-panel">
            <div class="branch-header">
                🌿 ${to} (${toCommits.length} 个提交)
            </div>
            <div class="commit-list">
                ${toCommits.map(commit => `
                    <div class="commit-item">
                        <div>
                            <span class="commit-hash">${commit.hash.substring(0, 8)}</span>
                            <span class="commit-date">${new Date(commit.date).toLocaleDateString('zh-CN')}</span>
                        </div>
                        <div class="commit-message">${commit.message}</div>
                        <div class="commit-author">👤 ${commit.author.replace(/<.*>/, '').trim()}</div>
                    </div>
                `).join('')}
            </div>
        </div>
    </div>
</body>
</html>`;
    }
    getErrorHtml(error) {
        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>错误</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            padding: 20px;
            text-align: center;
        }
        .error-container {
            background: var(--vscode-inputValidation-errorBackground);
            border: 1px solid var(--vscode-inputValidation-errorBorder);
            border-radius: 4px;
            padding: 20px;
            margin: 20px 0;
        }
        .error-icon {
            font-size: 48px;
            margin-bottom: 15px;
        }
        .error-title {
            font-size: 18px;
            font-weight: bold;
            margin-bottom: 10px;
        }
        .error-message {
            font-family: monospace;
            font-size: 12px;
            background: var(--vscode-textCodeBlock-background);
            padding: 10px;
            border-radius: 4px;
            margin-top: 15px;
        }
    </style>
</head>
<body>
    <div class="error-container">
        <div class="error-icon">⚠️</div>
        <div class="error-title">比较失败</div>
        <div>无法获取分支比较数据</div>
        <div class="error-message">${error.message}</div>
    </div>
</body>
</html>`;
    }
}
exports.ComparePanelProvider = ComparePanelProvider;
ComparePanelProvider.viewType = 'gitLogExplorer.comparePanel';
//# sourceMappingURL=comparePanelProvider.js.map