const { ImpitHttpClient } = require('./impit-client');

async function testTimeout() {
  console.log('--- Testing Timeout (Connection to google.com) ---');
  // 设置较短的连接超时，以便在无法连接时快速失败
  const client = new ImpitHttpClient({
    browser: 'chrome',
    timeout: 5000,        // 总超时 5秒
    connectTimeout: 3000, // 连接超时 3秒
    verbose: true,
    // 不使用代理，以便在国内网络下模拟连接超时或阻断
    proxy: '', 
    // 使用 Cloudflare DoH，确保 DNS 能解析到 Google IP，但 TCP 连接会被阻断
    dohUrl: 'https://cloudflare-dns.com/dns-query'
  });

  const url = 'https://www.google.com';
  console.log(`Sending request to ${url} with 3s connect timeout...`);

  const startTime = Date.now();
  try {
    const response = await client.sendRequest({
      url,
      method: 'GET',
    });
    console.log('Unexpected success:', response.statusCode);
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`Request failed as expected after ${duration}ms`);
    console.error('Error message:', error.message);
    
    // 验证错误信息是否包含超时相关的关键词
    if (error.message.includes('Timeout') || error.message.includes('timed out')) {
        console.log('✅ Timeout verified.');
    } else {
        console.log('⚠️ Failed with other error (maybe network unreachable or reset).');
    }
  }
}

testTimeout();
