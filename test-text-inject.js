/**
 * Test script for Windows Unicode Text Injector
 * 
 * This script tests the KEYEVENTF_UNICODE text injection.
 * Run it and quickly switch to a text input field to see the result.
 */

const os = require('os');

if (os.platform() !== 'win32') {
  console.log('This test only works on Windows!');
  process.exit(0);
}

const injector = require('./build/Release/win_text_injector.node');

console.log('=== Windows Unicode Text Injector Test ===\n');

// Test 1: Send single character
console.log('Test 1: Sending test character "A" in 3 seconds...');
console.log('Quick! Switch to a text input field!');

setTimeout(() => {
  console.log('\nSending "A"...');
  const result1 = injector.sendTestChar();
  console.log(`Result: ${result1 ? 'SUCCESS' : 'FAILED'}`);
  
  // Test 2: Send full string
  console.log('\n\nTest 2: Sending "Hello" in 3 seconds...');
  console.log('Quick! Switch to a text input field!');
  
  setTimeout(() => {
    console.log('\nSending "Hello"...');
    const result2 = injector.injectText('Hello');
    console.log(`Result: ${result2 ? 'SUCCESS' : 'FAILED'}`);
    
    // Test 3: Send Chinese text
    console.log('\n\nTest 3: Sending Chinese text "你好世界" in 3 seconds...');
    console.log('Quick! Switch to a text input field!');
    
    setTimeout(() => {
      console.log('\nSending "你好世界"...');
      const result3 = injector.injectText('你好世界');
      console.log(`Result: ${result3 ? 'SUCCESS' : 'FAILED'}`);
      
      console.log('\n=== All tests completed ===');
    }, 3000);
  }, 3000);
}, 3000);
