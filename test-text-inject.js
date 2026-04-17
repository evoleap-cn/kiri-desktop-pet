/**
 * 测试 PowerShell 文本注入功能
 * 运行此脚本验证 SendKeys 方案是否正常工作
 */

console.log('测试文本注入功能...\n');
console.log('请在 3 秒内切换到目标窗口（如记事本、浏览器等）\n');

// 引入 text-injector
const { injectText, ffiAvailable } = require('./src/asr/text-injector');

console.log(`当前使用的方法: ${ffiAvailable ? 'ffi-napi (KEYEVENTF_UNICODE)' : 'PowerShell SendKeys'}\n`);

// 延迟 3 秒后开始注入
setTimeout(() => {
  const testText = '你好，世界！Hello World! 123';
  
  console.log(`准备注入文本: ${testText}`);
  console.log('开始注入...\n');
  
  try {
    injectText(testText);
    console.log('\n✓ 文本注入成功！');
  } catch (err) {
    console.error('\n✗ 文本注入失败:', err.message);
    process.exit(1);
  }
}, 3000);
