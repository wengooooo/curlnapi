const path = require('path')
const pkgDir = path.dirname(require.resolve('@wengo/curlnapi-win32-x64-msvc/package.json'))
process.env.PATH = pkgDir + ';' + (process.env.PATH || '')
const { Impit } = require('@wengo/curlnapi-win32-x64-msvc')

async function main() {
  const proxy = 'http://127.0.0.1:8080'
  const client = new Impit({ impersonate: 'chrome', proxy, timeout: 20000, followRedirects: true, ignoreTlsErrors: true })
  try {
    const resp = await client.fetch('https://www.amazon.com', { method: 'GET', headers: {
      Accept: 'text/html'
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
