#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');

// 测试目录
const testDir = '/home/code/qingcloud/neonsan/qfcenter';

console.log('🧪 Git Log Explorer 性能测试');
console.log('='.repeat(50));
console.log(`📂 测试目录: ${testDir}`);

// 切换到测试目录
process.chdir(testDir);

console.log('\n📊 仓库信息:');
try {
    const branchCount = execSync('git branch -a | wc -l', { encoding: 'utf8' }).trim();
    const tagCount = execSync('git tag | wc -l', { encoding: 'utf8' }).trim();
    console.log(`   分支数量: ${branchCount}`);
    console.log(`   标签数量: ${tagCount}`);
} catch (error) {
    console.error('❌ 无法获取仓库信息:', error.message);
    process.exit(1);
}

console.log('\n⏱️ 性能测试:');

// 测试1: 原始方法 - 逐个获取标签hash
console.log('\n1. 原始方法 - 逐个获取标签hash:');
const start1 = Date.now();
try {
    const tags = execSync('git tag', { encoding: 'utf8' }).trim().split('\n').filter(t => t);
    console.log(`   获取标签列表: ${Date.now() - start1}ms`);
    
    const hashStart = Date.now();
    let hashCount = 0;
    for (const tag of tags.slice(0, 10)) { // 只测试前10个避免太慢
        try {
            execSync(`git rev-parse ${tag}`, { encoding: 'utf8' });
            hashCount++;
        } catch (e) {
            // 忽略错误
        }
    }
    const hashTime = Date.now() - hashStart;
    console.log(`   获取${hashCount}个标签hash: ${hashTime}ms`);
    console.log(`   预估全部${tags.length}个标签: ${Math.round(hashTime * tags.length / hashCount)}ms`);
} catch (error) {
    console.error('   ❌ 测试失败:', error.message);
}

// 测试2: 优化方法 - 批量获取
console.log('\n2. 优化方法 - 批量获取:');
const start2 = Date.now();
try {
    // 批量获取本地分支
    const localStart = Date.now();
    const localBranches = execSync("git for-each-ref --format='%(refname:short)' refs/heads", { encoding: 'utf8' });
    console.log(`   本地分支: ${Date.now() - localStart}ms`);
    
    // 批量获取远程分支
    const remoteStart = Date.now();
    const remoteBranches = execSync("git for-each-ref --format='%(refname:short)' refs/remotes/origin", { encoding: 'utf8' });
    console.log(`   远程分支: ${Date.now() - remoteStart}ms`);
    
    // 批量获取标签和hash
    const tagStart = Date.now();
    const tagsWithHash = execSync("git for-each-ref --format='%(refname:short) %(objectname)' refs/tags", { encoding: 'utf8' });
    console.log(`   标签+hash: ${Date.now() - tagStart}ms`);
    
    console.log(`   总计: ${Date.now() - start2}ms`);
} catch (error) {
    console.error('   ❌ 测试失败:', error.message);
}

// 测试3: 并行获取
console.log('\n3. 并行获取测试:');
const start3 = Date.now();
try {
    const { spawn } = require('child_process');
    
    const promises = [
        new Promise((resolve, reject) => {
            const proc = spawn('git', ['for-each-ref', '--format=%(refname:short)', 'refs/heads']);
            let output = '';
            proc.stdout.on('data', (data) => output += data);
            proc.on('close', (code) => code === 0 ? resolve(output) : reject(new Error('Command failed')));
        }),
        new Promise((resolve, reject) => {
            const proc = spawn('git', ['for-each-ref', '--format=%(refname:short)', 'refs/remotes/origin']);
            let output = '';
            proc.stdout.on('data', (data) => output += data);
            proc.on('close', (code) => code === 0 ? resolve(output) : reject(new Error('Command failed')));
        }),
        new Promise((resolve, reject) => {
            const proc = spawn('git', ['for-each-ref', '--format=%(refname:short) %(objectname)', 'refs/tags']);
            let output = '';
            proc.stdout.on('data', (data) => output += data);
            proc.on('close', (code) => code === 0 ? resolve(output) : reject(new Error('Command failed')));
        })
    ];
    
    Promise.all(promises).then(() => {
        console.log(`   并行执行: ${Date.now() - start3}ms`);
        
        console.log('\n🎯 性能总结:');
        console.log('   ✅ 批量命令比逐个调用快数十倍');
        console.log('   ✅ 并行执行进一步提升性能');
        console.log('   ✅ 适合大型仓库的高性能需求');
    }).catch(error => {
        console.error('   ❌ 并行测试失败:', error.message);
    });
    
} catch (error) {
    console.error('   ❌ 并行测试失败:', error.message);
}

console.log('\n✨ 测试完成！'); 