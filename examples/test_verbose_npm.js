const path = require('path')
const pkgDir = path.dirname(require.resolve('@wengo/curlnapi-win32-x64-msvc/package.json'))
process.env.PATH = pkgDir + ';' + (process.env.PATH || '')
const { Impit } = require('@wengo/curlnapi-win32-x64-msvc')

async function main() {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy
  const url = process.env.URL || 'https://tls.browserleaks.com/json'
  console.log('Using proxy:', proxy || 'none')
  console.log('Target URL:', url)
  const client = new Impit({
    impersonate: 'chrome',
    proxy,
    timeout: 30000,
    connectTimeout: Number(process.env.CONNECT_TIMEOUT || 15000),
    followRedirects: true,
    ignoreTlsErrors: true,
    verbose: true,
    dohUrl: process.env.DOH_URL || 'https://cloudflare-dns.com/dns-query',
    dohResolve: process.env.DOH_RESOLVE || ''
  })
  try {
    const resp = await client.fetch(url, { method: 'GET' })
    const text = await resp.text()
    console.log('status:', resp.status)
    console.log('ok:', resp.ok)
    console.log('url:', resp.url)
    console.log('body_length:', text.length)
  } catch (e) {
    console.error('error:', e && e.message ? e.message : String(e))
    process.exitCode = 1
  }
}

main()
