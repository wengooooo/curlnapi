const fs = require('fs')
const path = require('path')
function cleanFiles(dir){ if(fs.existsSync(dir)) fs.readdirSync(dir).forEach(f=>{const p=path.join(dir,f);if(fs.statSync(p).isFile() && f.endsWith('.node'))fs.unlinkSync(p)}) }
function mkdir(dir){ if(!fs.existsSync(dir)) fs.mkdirSync(dir,{recursive:true}) }
function cp(src,dst){ fs.copyFileSync(src,dst) }
function listDlls(dir){ return fs.existsSync(dir)?fs.readdirSync(dir).filter(f=>f.toLowerCase().endsWith('.dll')).map(f=>path.join(dir,f)):[] }
function main(){
  const root = path.resolve(__dirname,'..')
  const nodePath = path.join(root,'build','Release','curlnapi.node')
  if(!fs.existsSync(nodePath)) throw new Error('build/Release/curlnapi.node not found')
  const plat = process.platform
  const arch = process.arch
  let outDir = null
  let outName = null
  if(plat==='win32' && arch==='x64') outDir = path.join(root,'curlnapi-win32-64-msvc')
  else if(plat==='linux' && arch==='x64') outDir = path.join(root,'curlnapi-linux-x64-gnu')
  else throw new Error(`unsupported platform: ${plat} ${arch}`)
  if(plat==='win32') outName = 'curlnapi-node.win32-x64-msvc'
  else if(plat==='linux') outName = 'curlnapi-node.linux-x64-gnu'
  mkdir(outDir)
  cleanFiles(outDir)
  cp(nodePath, path.join(outDir, `${outName}.node`))
  if(plat==='win32'){
    const dlls = listDlls(path.join(root,'lib64'))
    for(const dll of dlls){
      cp(dll, path.join(outDir, path.basename(dll)))
    }
  }
  console.log('packaged to', outDir)
  console.log('files:', fs.readdirSync(outDir))
}
main()
