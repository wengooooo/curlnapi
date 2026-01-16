import { BasicCrawler } from '@crawlee/core';
import { CurlNapiHttpClient } from './curlnapi-client';

async function main() {
    // 实例化 CurlNapiHttpClient
    const httpClient = new CurlNapiHttpClient({
        impersonate: 'chrome',
        timeout: 30000,
        verbose: true,
        // 如果需要测试国内直连 Google，可以开启下面的 DoH 配置（前提是本地网络允许 TCP 连接）
        // dohUrl: 'https://cloudflare-dns.com/dns-query',
    });

    // 创建 BasicCrawler 并注入 httpClient
    const crawler = new BasicCrawler({
        httpClient,
        // 限制并发请求数，方便观察
        maxConcurrency: 1,
        // 处理每个请求
        requestHandler: async ({ request, sendRequest, log }) => {
            log.info(`Processing ${request.url}...`);
            
            // 使用 sendRequest 发送请求（底层会调用 httpClient.sendRequest）
            const response = await sendRequest();
            
            log.info(`Status Code: ${response.statusCode}`);
            log.info(`Response Body Length: ${response.body.length}`);
            
            // 简单的内容检查
            if (request.url.includes('browserleaks')) {
                try {
                    const json = JSON.parse(response.body);
                    log.info('User Agent from server:', { ua: json.user_agent });
                } catch (e) {
                    log.error('Failed to parse JSON body');
                }
            }
        },
    });

    // 添加测试 URL
    await crawler.run([
        'https://tls.browserleaks.com/json',
        'https://www.example.com',
    ]);
}

main().catch(console.error);
