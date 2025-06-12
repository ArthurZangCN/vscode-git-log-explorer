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