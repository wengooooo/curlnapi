const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');
const child_process = require('child_process');
const zlib = require('zlib');
const { pipeline } = require('stream');
const { promisify } = require('util');

const streamPipeline = promisify(pipeline);

// Helper to remove directory recursively
function rmDir(dirPath) {
    if (fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { recursive: true, force: true });
    }
}

// Helper to ensure directory exists
function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

// Helper to detect architecture
function detectArch() {
    const libsJsonPath = path.join(__dirname, '..', 'libs.json');
    const libs = JSON.parse(fs.readFileSync(libsJsonPath, 'utf8'));
    
    const platform = os.platform();
    const arch = os.arch();
    const isMusl = platform === 'linux' && isMuslLibc();
    
    // Convert Node.js platform/arch to libs.json format
    let system, machine, libc;
    
    if (platform === 'win32') system = 'Windows';
    else if (platform === 'linux') system = 'Linux';
    else if (platform === 'darwin') system = 'Darwin';
    else throw new Error(`Unsupported platform: ${platform}`);
    
    if (arch === 'x64') machine = system === 'Windows' ? 'AMD64' : 'x86_64';
    else if (arch === 'arm64') machine = system === 'Windows' ? 'ARM64' : 'aarch64';
    else throw new Error(`Unsupported arch: ${arch}`);
    
    if (system === 'Linux') {
        libc = isMusl ? 'musl' : 'gnu';
    }

    const matched = libs.find(l => {
        if (l.system !== system) return false;
        if (l.machine !== machine) return false;
        if (system === 'Linux' && l.libc !== libc) return false;
        return true;
    });

    if (!matched) {
        throw new Error(`No matching configuration found for ${system} ${machine} ${libc || ''}`);
    }

    return matched;
}

function isMuslLibc() {
    try {
        const output = child_process.execSync('ldd --version', { encoding: 'utf8' });
        return output.includes('musl');
    } catch {
        return false;
    }
}

// Helper to download file
function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        const request = https.get(url, (response) => {
            if (response.statusCode === 302 || response.statusCode === 301) {
                downloadFile(response.headers.location, dest).then(resolve).catch(reject);
                return;
            }
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download: ${response.statusCode}`));
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve();
            });
        });
        request.on('error', (err) => {
            fs.unlink(dest, () => {});
            reject(err);
        });
    });
}

async function setupLinuxHeaders(libDir) {
    const includeDir = path.join(libDir, 'include');
    if (fs.existsSync(includeDir)) return;

    console.log('Setting up Linux headers...');
    const tempDir = path.join(libDir, 'temp_build');
    ensureDir(tempDir);

    const curlVersion = 'curl-8_15_0';
    const curlZipUrl = `https://github.com/curl/curl/archive/${curlVersion}.zip`;
    const curlZipPath = path.join(tempDir, 'curl.zip');
    
    // We clone curl-impersonate to get the patches
    const impersonateDir = path.join(tempDir, 'curl-impersonate');
    
    try {
        // 1. Clone curl-impersonate
        if (!fs.existsSync(impersonateDir)) {
             console.log('Cloning curl-impersonate...');
             child_process.execSync(`git clone https://github.com/lexiforest/curl-impersonate.git "${impersonateDir}"`, { stdio: 'inherit' });
        }

        // 2. Download curl
        console.log(`Downloading ${curlZipUrl}...`);
        await downloadFile(curlZipUrl, curlZipPath);

        // 3. Unzip curl
        console.log('Unzipping curl...');
        child_process.execSync(`unzip -q -o "${curlZipPath}" -d "${tempDir}"`, { stdio: 'inherit' });
        
        // Find extracted directory (usually curl-curl-8_15_0)
        const extractedDirs = fs.readdirSync(tempDir).filter(f => f.startsWith('curl-') && f !== 'curl-impersonate' && fs.statSync(path.join(tempDir, f)).isDirectory());
        let curlSourceDir;
        if (extractedDirs.length > 0) {
            curlSourceDir = path.join(tempDir, extractedDirs[0]);
        }
        
        if (!curlSourceDir) {
            // Fallback: try to find any other directory
             const dirs = fs.readdirSync(tempDir).filter(f => f !== 'curl-impersonate' && fs.statSync(path.join(tempDir, f)).isDirectory());
             if (dirs.length > 0) curlSourceDir = path.join(tempDir, dirs[0]);
        }

        if (!curlSourceDir) throw new Error('Could not find extracted curl directory');
        console.log(`Curl source found at: ${curlSourceDir}`);

        // 4. Patch
        console.log('Applying patch...');
        const patchPath = path.join(impersonateDir, 'patches', 'curl.patch');
        
        if (!fs.existsSync(patchPath)) {
            // Fallback: search for curl.patch
             console.log(`Patch file not found at ${patchPath}, searching...`);
             throw new Error(`Patch file not found at ${patchPath}`);
        }
        
        try {
            // Try using git apply first since git is likely installed (we just used it to clone)
            // and 'patch' command might be missing on some minimal systems.
            console.log('Attempting to patch using git apply...');
            child_process.execSync(`git apply -p1 --verbose "${patchPath}"`, { cwd: curlSourceDir, stdio: 'inherit' });
        } catch (gitErr) {
            console.warn('git apply failed or not available, falling back to patch command...');
            console.warn(gitErr.message);
            
            // Fallback to 'patch' command
            const patchCmd = `patch -p1 < "${patchPath}"`;
            child_process.execSync(patchCmd, { cwd: curlSourceDir, stdio: 'inherit', shell: '/bin/bash' });
        }
        
        // 5. Copy headers
        console.log('Copying headers...');
        const curlInclude = path.join(curlSourceDir, 'include');
        fs.renameSync(curlInclude, includeDir);
        
        console.log('Linux headers set up successfully.');

    } catch (e) {
        console.error('Failed to set up Linux headers:', e);
        console.error('Ensure git, unzip, and patch are installed.');
        throw e;
    } finally {
        // Cleanup tempDir
        rmDir(tempDir);
    }
}

// Main logic
async function main() {
    const rootDir = path.resolve(__dirname, '..');
    const libDir = path.join(rootDir, 'lib64');
    const version = "1.2.5"; // Hardcoded version matching build.py
    
    const config = detectArch();
    const soName = config.so_name;
    
    // Check if already installed
    if (fs.existsSync(path.join(libDir, soName)) || 
        (config.system === 'Windows' && fs.existsSync(path.join(libDir, 'libcurl.dll')))) {
        
        if (config.system === 'Linux') {
            await setupLinuxHeaders(libDir);
        }
        
        console.log('libcurl-impersonate already installed.');
        return;
    }

    console.log(`Detected architecture: ${config.system} ${config.machine}`);
    ensureDir(libDir);

    // Construct download URL
    let sysname = config.sysname;
    if (config.system === 'Linux') {
        sysname = `linux-${config.libc}`;
    }
    
    const fileName = `libcurl-impersonate-v${version}.${config.so_arch}-${sysname}.tar.gz`;
    const downloadUrl = `https://github.com/lexiforest/curl-impersonate/releases/download/v${version}/${fileName}`;
    const tarPath = path.join(libDir, fileName);

    console.log(`Downloading ${downloadUrl}...`);
    try {
        await downloadFile(downloadUrl, tarPath);
    } catch (e) {
        console.error('Download failed:', e);
        process.exit(1);
    }

    console.log('Extracting...');
    try {
        // Use system tar if available (usually available on Linux/Mac and Win10+)
        // If not, we would need a pure JS implementation like 'tar' package, 
        // but trying to avoid dependencies first.
        child_process.execSync(`tar -xzf "${tarPath}" -C "${libDir}"`);
        
        // Windows specific cleanup: move lib/*.lib and bin/*.dll to libDir root
        if (config.system === 'Windows') {
            const libSubDir = path.join(libDir, 'lib');
            const binSubDir = path.join(libDir, 'bin');
            
            if (fs.existsSync(libSubDir)) {
                fs.readdirSync(libSubDir).forEach(file => {
                    if (file.endsWith('.lib')) {
                        fs.renameSync(path.join(libSubDir, file), path.join(libDir, file));
                    }
                });
            }
            if (fs.existsSync(binSubDir)) {
                fs.readdirSync(binSubDir).forEach(file => {
                    if (file.endsWith('.dll')) {
                        fs.renameSync(path.join(binSubDir, file), path.join(libDir, file));
                    }
                });
            }
        }

        // Linux: fetch headers using setupLinuxHeaders
        if (config.system === 'Linux') {
            await setupLinuxHeaders(libDir);
        }
        
        // Clean up tar file
        fs.unlinkSync(tarPath);
        console.log('Installation complete.');
        
    } catch (e) {
        console.error('Extraction failed. Make sure "tar" command is available in your PATH.');
        console.error(e);
        process.exit(1);
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
