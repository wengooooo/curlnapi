// test_linux.js
const { Impit } = require('curlnapi-node')

// 可选：从环境变量读取代理（如果你有的话）
const proxy =
  process.env.HTTPS_PROXY ||
  process.env.https_proxy ||
  process.env.HTTP_PROXY ||
  process.env.http_proxy

// 可选：在 Linux 上自动探测常见 CA 证书路径，避免 SSL 证书错误
const fs = require('fs')

function getLinuxCAPath() {
  if (process.platform !== 'linux') return undefined
  const paths = [
    '/etc/pki/tls/certs/ca-bundle.crt',       // Fedora/RHEL/CentOS
    '/etc/ssl/certs/ca-certificates.crt',     // Debian/Ubuntu
    '/etc/ssl/ca-bundle.pem',                 // SUSE
    '/etc/pki/tls/cacert.pem',                // 一些其他发行版
    '/etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem',
  ]
  for (const p of paths) {
    if (fs.existsSync(p)) {
      console.log('Using CA Path:', p)
      return p
    }
  }
  console.warn('No common CA bundle found, consider setting ignoreTlsErrors=true')
  return undefined
}

async function main() {
  const url = process.env.URL || 'https://tls.browserleaks.com/json'

  console.log('Platform:', process.platform)
  console.log('Using proxy:', proxy || 'none')
  console.log('Target URL:', url)

  const client = new Impit({
    // 浏览器伪装：chrome / firefox
    impersonate: 'chrome',
    proxy,
    timeout: 30000,
    connectTimeout: Number(process.env.CONNECT_TIMEOUT || 15000),
    followRedirects: true,
    // 如果你本地证书没配好，可以先设为 true，确认通路后再关掉
    ignoreTlsErrors: false,
    caPath: getLinuxCAPath(),
    verbose: true, // 打开原生 curl verbose 输出，方便调试
    dohUrl: process.env.DOH_URL || 'https://cloudflare-dns.com/dns-query',
    dohResolve: process.env.DOH_RESOLVE || '',
  })

  try {
    const resp = await client.fetch(url, { method: 'GET' })
    const text = await resp.text()

    console.log('status:', resp.status)
    console.log('ok:', resp.ok)
    console.log('url:', resp.url)
    console.log('headers_count:', resp.headers.length)
    console.log('body_length:', text.length)
    console.log('body snippet:', text.slice(0, 200))
  } catch (e) {
    console.error('error:', e && e.message ? e.message : String(e))
    process.exitCode = 1
  }
}

main()