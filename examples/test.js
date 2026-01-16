const fs = require('fs')
const path = require('path')
function pickDir() {
  const winDir = path.resolve(__dirname, '..', 'curlnapi-win32-64-msvc')
  const linuxDir = path.resolve(__dirname, '..', 'curlnapi-linux-x64-gnu')
  const buildDir = path.resolve(__dirname, '..', 'build', 'Release')
  const winName = 'curlnapi-node.win32-x64-msvc.node'
  const linName = 'curlnapi-node.x64-gnu.node'
  if (process.platform === 'win32' && fs.existsSync(path.join(winDir, winName))) return winDir
  if (process.platform === 'linux' && fs.existsSync(path.join(linuxDir, linName))) return linuxDir
  return buildDir
}
const baseDir = pickDir()
const moduleName = process.platform === 'win32' ? 'curlnapi-node.win32-x64-msvc' : 'curlnapi-node.x64-gnu'
const sep = process.platform === 'win32' ? ';' : ':'
process.env.PATH = baseDir + sep + (process.env.PATH || '')
let modPath = path.join(baseDir, moduleName)
if (!fs.existsSync(modPath) && fs.existsSync(path.join(baseDir, 'curlnapi.node'))) {
  modPath = path.join(baseDir, 'curlnapi.node')
}
const { Impit } = require(modPath)
// Get proxy from environment
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;

async function main() {
  console.log('Using proxy:', proxy || 'none');
  const targetUrl = 'https://www.google.com'; // Use Google for connectivity test on foreign server
  console.log('Target URL:', targetUrl);
  
  const client = new Impit({ 
      impersonate: 'chrome', 
      proxy, 
      timeout: 30000, 
      connectTimeout: 10000, 
      followRedirects: true, 
      ignoreTlsErrors: true,
      // Linux: Use system CA certificates if available, or bundled one
      caPath: process.platform === 'linux' ? '/etc/ssl/certs/ca-certificates.crt' : undefined,
      verbose: true,
      ipResolve: 'v4' // Force IPv4 to avoid potential IPv6 timeout issues
  })
  try {
    const resp = await client.fetch(targetUrl, { method: 'GET' })
    const text = await resp.text()
    console.log('status:', resp.status)
    console.log('ok:', resp.ok)
    console.log('url:', resp.url)
    console.log('headers_count:', resp.headers.length)
    console.log('body_length:', text.length)
    console.log('body:', text)
  } catch (e) {
    console.error('error:', e && e.message ? e.message : String(e))
    process.exitCode = 1
  }
}

main()
