const { ImpitHttpClient } = require('./impit-client');

async function main() {
  const client = new ImpitHttpClient({
    impersonate: 'chrome', 
      // proxy, 
      timeout: 30000, 
      connectTimeout: Number(process.env.CONNECT_TIMEOUT || 15000), 
      followRedirects: true, 
      ignoreTlsErrors: false, 
      caPath: 'E:\\curlnapi\\examples\\cacert.pem', 
      verbose: true,
      debug:  true,
      dohUrl: process.env.DOH_URL || 'https://cloudflare-dns.com/dns-query',
      dohResolve: process.env.DOH_RESOLVE || '',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      // headers: {
      //   'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      // }
  });

  const url = 'https://tls.browserleaks.com/json';
  console.log(`Sending request to ${url}...`);

  try {
    const response = await client.sendRequest({
      url,
      method: 'GET',
      responseType: 'json'
    });

    console.log('Response Status:', response.statusCode);
    console.log('Response Headers:', response.headers);
    console.log('Response Body:', response.body);
  } catch (error) {
    console.error('Request failed:', error);
  }
}

main();
