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

// Auto-detect CA path for Linux
function getLinuxCAPath() {
    if (process.platform !== 'linux') return undefined;
    const paths = [
        '/etc/pki/tls/certs/ca-bundle.crt', // Fedora/RHEL/CentOS
        '/etc/ssl/certs/ca-certificates.crt', // Debian/Ubuntu/Gentoo
        '/etc/ssl/ca-bundle.pem', // SUSE/OpenSUSE
        '/etc/pki/tls/cacert.pem', // OpenELEC
        '/etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem' // CentOS/RHEL 7+
    ];
    for (const p of paths) {
        if (fs.existsSync(p)) {
            console.log('Using CA Path:', p);
            return p;
        }
    }
    console.warn('Warning: No common CA certificate bundle found.');
    return undefined;
}

async function main() {
  targetUrl = 'https://tls.browserleaks.com/json'
  console.log('Using proxy:', proxy || 'none');
  console.log('Target URL:', targetUrl);
  
  const client = new Impit({ 
      impersonate: 'chrome', 
      proxy, 
      timeout: 30000, 
      connectTimeout: Number(process.env.CONNECT_TIMEOUT || 15000), 
      followRedirects: true, 
      ignoreTlsErrors: false, 
      caPath: getLinuxCAPath(), 
      verbose: true,
      dohUrl: process.env.DOH_URL || 'https://cloudflare-dns.com/dns-query',
      dohResolve: process.env.DOH_RESOLVE || ''
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
