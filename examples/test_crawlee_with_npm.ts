import { CheerioCrawler } from 'crawlee';
import { CurlNapiHttpClient, Browser } from './curlnapi-client';

// 启用 Impit 调试日志
// process.env.VERBOSE = '1';

const httpClient = new CurlNapiHttpClient({ 
    followRedirects: true,
    browser: Browser.Chrome,
    // 设置本地代理
    proxyUrl: 'http://127.0.0.1:8080',
    // 如有需要，可开启忽略 TLS 错误
    ignoreTlsErrors: true,
    debug: true,
    verbose: true,
});

const crawler = new CheerioCrawler({
    // 使用自定义的 CurlNapiHttpClient
    httpClient,
    requestHandler: async ({ $, log, request, body }) => {
        log.info('Processing request...', { url: request.url });
        
        // 尝试解析并打印 JSON，否则打印 body 原文
        if (Buffer.isBuffer(body)) {
             try {
                const text = body.toString('utf-8');
                const json = JSON.parse(text);
                console.dir(json, { depth: null, colors: true });
             } catch {
                console.log(body.toString('utf-8'));
             }
        } else if (typeof body === 'string') {
            try {
                const json = JSON.parse(body);
                console.dir(json, { depth: null, colors: true });
            } catch {
                console.log(body);
            }
        } else {
            console.dir(body, { depth: null, colors: true });
        }
    },
});

(async () => {
    // 设置 Amazon Cookie
    const cookieStr = 'session-id=520-3432763-6619032; lc-acbuk=en_GB; ubid-acbuk=261-8790247-0855808; sso-state-acbuk=Xdsso|ZQG-J6z6kqG231syhNdNwhS5_Q7lcebxYKWUYRvz0Svu0x-axk_3b2Rb5NEeGPEAXIjkHc8KUNsUJgDg6MbaRuVXDRZg5ajuU505UwHWg8KZ3Ovr; i18n-prefs=GBP; at-acbuk=Atza|gQC4SOQtAwEBALe-NKeevTEzTSfrCiEdLfTAZiaglHSVfBbK2B_RpLt4rMAMIprXUtKQFv0gCICBSKWRuGpN9a_nAIW_SdgiFXfiREYIUEV19FIHjYgSMpGmgmtdwYqN48lecXt1-71N5FWHUt1o34rRZHkTPyYwfjuaxjHL3r_xGZjP2H5pYX3i5l5w3KP87RAbLPtd_0v1Ao-RkGqHOYEdpXzvBGdreYuwKmHLvznQ1EB6fRvAR6ZJsCBchwqD7o03Qe-ViNuM273Nmxcw2mowfKF5PCwHP1spQjxh9ZGRvnwgPHsQqZwQ7euEw9eOMhWQxg45HvGEFBdT0hrdrqgGQCSNdDFHOKgQT30j3wlobamZ_SFPSEmw1zpfGlZYdhGsk7ymgRSNtspvVkvBrHR9DUDnQZsVFjoVSzPAWoXMDKE; sess-at-acbuk=h8dyKZqGM54ZLiasgvsg9UM7HSVPWcSGBD9l4z7zc2s=; sst-acbuk=Sst1|PQLzwohMykcZpPcYyruIYpxBCivK2t-Y2deQrVmDQpvwd5JAi7BnYGEUZMfxeJm-htVNEJe3GuTmiMFT87mNiHAdTXRRV-dXWq4T2d92y6mzRve0XjDO1oLRZfGweDe9S8lKQB7Lvowwcc2HpXBDnfyvCZKdxcHaMVGrynZUfqaYtZcnUhpRBAHp6sQtEEhOq_KL_ErRQCoAU-Rz2_KhxHnyPxhFDcJw_iPI23ZLvvAdtMcyDAhCVYs5yXdGu_sndL-iYQu5aqdta7lNTzDefH4Wiar69YD0BQe-aC4ybrVOtylJF4hFWNE6xAFH3pYVuJMq; session-id-time=2082787201l; x-acbuk="D6E1EmC2Gt61jieU59NPG@O5RMFD9xKJwxiG4ZsL8om8eOTlzClWtzNoBvbyqP0O"; session-token=GZ9fEfY09afC6U6bj83sUbKH7ODDgAj/dOCPLvuCREFyH8sOapKp5aUSuLwzx3GGyIpr2t8UQQEOTqBLHN1VeUOPx+5JDOJeP9i6rLBzjtfe46Lq/MWgxAnxD4Zo9yqtHV7C9upOC3+2964HqiQYwCdKob6jM4tT7CNmMzB+7ePbhMhBxyDFvfYC4KQowJg2fRr6hkM8vdDy5mZCOxX/T7Gf5z+gAlk/j8O4gnRtot88+AeCdhshuHpiVr2I7XbmCqszH/w9iwjFVXFt6UR6KBAjlTkHaKJYSKxv0ukfR5NfxL7f4zWKhzKxP3LrM4OdPXHpw16xKfL4EEyqHtzu878qvouJdTSEA9eu0I7+h7iEH2e3t97vWE47MFOrzKJC1YTGJPhiSW8=';
    
    // 解析 Cookie 字符串并添加到请求头
    // const cookies = cookieStr.split(';').map(c => c.trim()).filter(Boolean);
    
    // 使用数组以保证顺序
     await crawler.run([{
         url: 'https://httpbin.org/get',
         headers: {
              // 调整为更接近 Chrome 的顺序
              'Cache-Control': 'max-age=0',
              'Upgrade-Insecure-Requests': '1',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
              'Accept-Language': 'en-GB,en;q=0.9',
              'Cookie': cookieStr,
          }
     }]);
})();
