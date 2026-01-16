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
// const proxy = 'http://127.0.0.1:8080'

async function main() {
  // const client = new Impit({ impersonate: 'chrome', proxy, timeout: 20000, followRedirects: true, ignoreTlsErrors: true })
  const client = new Impit({ impersonate: 'chrome', timeout: 20000, followRedirects: true, ignoreTlsErrors: true })
  try {
    const resp = await client.fetch('https://www.amazon.com', { method: 'GET', headers: { 
        Accept: 'text/html',
        Cookie: 'session-id=132-8225125-0523234; i18n-prefs=USD; sp-cdn=\"L5Z9:CN\"; ubid-main=132-8225125-0523234; session-id-time=2082787201l; csm-hit=tb:132-8225125-0523234|1694522401234&adb:adid=A13V1IB3VIYZZH&adb:session-id=132-8225125-0523234'
    } })
    const text = await resp.text()
    console.log('status:', resp.status)
    console.log('ok:', resp.ok)
    console.log('url:', resp.url)
    console.log('headers_count:', resp.headers.length)
    console.log('body_length:', text.length)
  } catch (e) {
    console.error('error:', e && e.message ? e.message : String(e))
    process.exitCode = 1
  }
}

main()
