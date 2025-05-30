import * as vscode from 'vscode';
import { GitLogWebviewProvider } from './webviewProvider';
import { GitService } from './gitService';

export function activate(context: vscode.ExtensionContext) {
    console.log('🚀 Git Log Explorer 插件开始激活...');
    
    try {
        // 创建Git服务
        const gitService = new GitService();
        console.log('✅ GitService已创建');
        
        // 创建GitLogWebviewProvider
        const webviewProvider = new GitLogWebviewProvider(context.extensionUri, gitService);
        console.log('✅ GitLogWebviewProvider已创建');
        
        // 注册WebView提供者
        const webviewRegistration = vscode.window.registerWebviewViewProvider(
            GitLogWebviewProvider.viewType,
            webviewProvider
        );
        context.subscriptions.push(webviewRegistration);
        console.log('✅ WebView提供者已注册');
        
        // 注册命令
        const refreshCommand = vscode.commands.registerCommand('gitLogExplorer.refresh', () => {
            console.log('🔄 刷新命令被调用');
            // webviewProvider有自己的刷新机制
        });
        
        context.subscriptions.push(refreshCommand);
        console.log('✅ 所有命令已注册');
        console.log('🎉 Git Log Explorer 插件激活完成！');
        
        // 显示激活消息
        vscode.window.showInformationMessage('🎉 Git Log Explorer 插件已激活！');
        
    } catch (error) {
        console.error('❌ 插件激活失败:', error);
        vscode.window.showErrorMessage(`Git Log Explorer 激活失败: ${error}`);
    }
}

export function deactivate() {
    console.log('👋 Git Log Explorer 插件已停用');
} 