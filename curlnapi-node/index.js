const os = require('os')
const path = require('path')
const fs = require('fs')

function tryRequire(name) {
  try { return require(name) } catch { return null }
}

function isMuslFromFilesystem() {
  try { return fs.readFileSync('/usr/bin/ldd', 'utf-8').includes('musl') } catch { return null }
}
function isMuslFromReport() {
  let report = null
  if (typeof process.report?.getReport === 'function') {
    process.report.excludeNetwork = true
    report = process.report.getReport()
  }
  if (!report) return null
  if (report.header && report.header.glibcVersionRuntime) return false
  if (Array.isArray(report.sharedObjects)) {
    if (report.sharedObjects.some(f => f.includes('libc.musl-') || f.includes('ld-musl-'))) return true
  }
  return false
}
function isMusl() {
  if (os.platform() !== 'linux') return false
  const a = isMuslFromFilesystem()
  if (a !== null) return a
  const b = isMuslFromReport()
  if (b !== null) return b
  try { return require('child_process').execSync('ldd --version', { encoding: 'utf8' }).includes('musl') } catch { return false }
}

function resolveNative() {
  const platform = os.platform()
  const arch = os.arch()
  const candidates = []
  if (platform === 'win32' && arch === 'x64') candidates.push('@wengo/curlnapi-win32-x64-msvc')
  if (platform === 'linux' && arch === 'x64') candidates.push(isMusl() ? '@wengo/curlnapi-linux-x64-musl' : '@wengo/curlnapi-linux-x64-gnu')
  if (platform === 'darwin' && arch === 'x64') candidates.push('curlnapi-darwin-x64')
  if (platform === 'darwin' && arch === 'arm64') candidates.push('curlnapi-darwin-arm64')
  for (const pkg of candidates) {
    const mod = tryRequire(pkg)
    if (mod) return mod
  }
  const root = path.resolve(__dirname, '..')
  const lib64 = path.join(root, 'lib64')
  const bin = path.join(lib64, 'bin')
  if (platform === 'win32') {
    const paths = [lib64, bin, process.env.PATH || ''].filter(Boolean)
    process.env.PATH = paths.join(';')
  }
  return require(path.join(root, 'build', 'Release', 'curlnapi.node'))
}

module.exports = resolveNative()
