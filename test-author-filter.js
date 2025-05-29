#!/usr/bin/env node

// 模拟比较功能中的作者筛选逻辑测试

console.log('🧪 作者筛选逻辑测试');
console.log('='.repeat(50));

// 模拟提交数据
const mockFromCommits = [
    { hash: 'abc123', author: '张三 <zhangsan@example.com>', message: '添加新功能A' },
    { hash: 'def456', author: '李四 <lisi@example.com>', message: '修复bug B' },
    { hash: 'ghi789', author: '张三 <zhangsan@example.com>', message: '优化性能C' },
    { hash: 'jkl012', author: '王五 <wangwu@example.com>', message: '添加新功能D' },
    { hash: 'mno345', author: '张三 <zhangsan@example.com>', message: '重构代码E' }
];

const mockToCommits = [
    { hash: 'pqr678', author: '李四 <lisi@example.com>', message: '修复bug B' }, // 相同message
    { hash: 'stu901', author: '张三 <zhangsan@example.com>', message: '添加测试F' },
    { hash: 'vwx234', author: '赵六 <zhaoliu@example.com>', message: '更新文档G' },
    { hash: 'yzab567', author: '张三 <zhangsan@example.com>', message: '重构代码E' }, // 相同message
    { hash: 'cdef890', author: '李四 <lisi@example.com>', message: '优化UI H' }
];

function testAuthorFilter(fromCommits, toCommits, authorFilter, hideIdentical) {
    console.log(`\n📋 测试场景: 作者筛选="${authorFilter}", 隐藏相同提交=${hideIdentical}`);
    console.log('-'.repeat(60));
    
    // 步骤1: 作者筛选
    let filteredFromCommits = fromCommits;
    let filteredToCommits = toCommits;
    
    if (authorFilter) {
        filteredFromCommits = fromCommits.filter(commit => 
            commit.author.toLowerCase().includes(authorFilter.toLowerCase())
        );
        filteredToCommits = toCommits.filter(commit => 
            commit.author.toLowerCase().includes(authorFilter.toLowerCase())
        );
        console.log(`作者筛选后: from分支${filteredFromCommits.length}个提交, to分支${filteredToCommits.length}个提交`);
    }
    
    // 步骤2: 隐藏相同提交
    let finalFromCommits = filteredFromCommits;
    let finalToCommits = filteredToCommits;
    
    if (hideIdentical) {
        // 使用已经按作者筛选过的数据
        const fromMessages = new Set(filteredFromCommits.map(c => c.message.trim()));
        const toMessages = new Set(filteredToCommits.map(c => c.message.trim()));
        
        finalFromCommits = filteredFromCommits.filter(c => !toMessages.has(c.message.trim()));
        finalToCommits = filteredToCommits.filter(c => !fromMessages.has(c.message.trim()));
        
        console.log(`隐藏相同提交后: from分支独有${finalFromCommits.length}个提交, to分支独有${finalToCommits.length}个提交`);
    }
    
    // 显示最终结果
    console.log('\n📊 最终结果:');
    console.log('From分支提交:');
    finalFromCommits.forEach((commit, i) => {
        const authorName = commit.author.replace(/<.*>/, '').trim();
        console.log(`  ${i+1}. ${commit.hash} - ${authorName}: ${commit.message}`);
    });
    
    console.log('To分支提交:');
    finalToCommits.forEach((commit, i) => {
        const authorName = commit.author.replace(/<.*>/, '').trim();
        console.log(`  ${i+1}. ${commit.hash} - ${authorName}: ${commit.message}`);
    });
    
    // 验证结果
    const allAuthors = [...finalFromCommits, ...finalToCommits].map(c => c.author.replace(/<.*>/, '').trim());
    const uniqueAuthors = [...new Set(allAuthors)];
    
    if (authorFilter) {
        const hasOtherAuthors = uniqueAuthors.some(author => 
            !author.toLowerCase().includes(authorFilter.toLowerCase())
        );
        
        if (hasOtherAuthors) {
            console.log('❌ 测试失败: 结果中包含其他作者的提交');
            console.log('   发现的作者:', uniqueAuthors);
        } else {
            console.log('✅ 测试通过: 作者筛选正确');
        }
    } else {
        console.log('✅ 测试通过: 无作者筛选');
    }
}

// 运行测试
console.log('\n🔍 原始数据:');
console.log('From分支:', mockFromCommits.length, '个提交');
console.log('To分支:', mockToCommits.length, '个提交');

// 测试1: 仅作者筛选
testAuthorFilter(mockFromCommits, mockToCommits, '张三', false);

// 测试2: 作者筛选 + 隐藏相同提交
testAuthorFilter(mockFromCommits, mockToCommits, '张三', true);

// 测试3: 仅隐藏相同提交
testAuthorFilter(mockFromCommits, mockToCommits, '', true);

// 测试4: 无筛选
testAuthorFilter(mockFromCommits, mockToCommits, '', false);

console.log('\n✨ 测试完成！'); 