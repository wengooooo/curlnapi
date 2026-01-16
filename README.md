# curlnapi

基于 libcurl-impersonate 的 Node.js 原生扩展，提供浏览器仿真与高级网络选项（代理、HTTP/2/3、DoH、DNS、超时等）。

**平台支持**
- Windows x64（MSVC）：动态链接运行时 DLL
- Linux x64（GNU）：默认静态链接（无需额外共享库）

**目录结构要点**
- build/Release/curlnapi.node：本地编译产物
- lib64/：Windows 运行时依赖（libcurl.dll、zlib.dll 等）
- scripts/：构建与打包脚本（build.js、package.js）
- examples/：示例脚本（本地源码与 npm 包测试）

## 编译
- 环境准备
  - Node.js ≥ 18（建议）
  - Windows：安装 Visual Studio Build Tools（MSVC），确保可编译 C++
  - Linux：安装编译工具链（build-essential 等）
- 安装依赖库（首次或缺库时）
  - Windows / Linux：下载并整理 libcurl-impersonate 运行依赖（支持 HTTPS_PROXY 环境变量）
    - node scripts/build.js
- 编译原生模块
  - npm run configure (首次编译或配置变更时建议运行)
  - npm run build
  - 产物生成于 build/Release/curlnapi.node
- 打包（生成最终文件）
  - npm run package
  - Linux 下会生成 curlnapi-64-gnu/curlnapi-node.x64-gnu.node
  - Windows 下会生成 curlnapi-win32-64-msvc/ 并包含所需 DLL

## 测试（源码版本）
- 自动代理示例
  - node examples/test.js
  - 输出包含 ok、url、headers_count、body_length
- 说明
  - 脚本自动读取系统代理环境变量 (HTTPS_PROXY/http_proxy)
  - 默认回退代理：http://127.0.0.1:7890
  - 网络异常会直接抛出错误（Promise reject）；HTTP 错误返回 response.ok=false

## 测试（npm 包）
- 安装官方包（Windows）
  - npm i @wengo/curlnapi-win32-x64-msvc
- 运行示例
  - node examples/test_npm.js
  - 脚本会自动将包目录加入 PATH，确保加载 DLL，并输出请求结果

## 打包发布
- 生成平台包目录
  - node scripts/package.js
  - Windows 输出：curlnapi-win32-64-msvc（包含 .node 与 DLL）
  - Linux 输出：curlnapi-linux-x64-gnu（包含 .node）
- npm 发布（示例）
  - 进入对应目录后执行 npm publish（建议使用 scope 包名，如 @wengo/...）

## 常见问题
- 缺少 DLL（Windows）：确保 lib64 中的 DLL 被复制到打包目录与 .node 同级，或将该目录加入 PATH
- 网络报错：为传输层异常（DNS/连接/握手/代理/超时），Promise 会 reject；HTTP 错误以 ok=false 表示
- 代理协议：支持 http、https、socks5/socks5h、socks4/socks4a；未带协议默认按 http 处理

## 代码位置
- 原生实现入口：[addon.cc](file:///e:/curlnapi/addon.cc)
- 绑定配置：[binding.gyp](file:///e:/curlnapi/binding.gyp)
- 构建脚本：[build.js](file:///e:/curlnapi/scripts/build.js)、打包脚本：[package.js](file:///e:/curlnapi/scripts/package.js)
- 示例脚本（源码）：[test.js](file:///e:/curlnapi/examples/test.js)
- 示例脚本（npm 包）：[test_npm.js](file:///e:/curlnapi/examples/test_npm.js)
