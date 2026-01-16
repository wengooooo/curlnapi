## 目标
- 在 e:\curlnapi\research 复刻 CurlNapi 版 BaseHttpClient，语义与行为严格对齐 [impit-client.ts](file:///e:/curlnapi/research/impit-client.ts)。
- 必要时微调原生实现与 JS 包装，以确保：重定向改写、CookieJar 同步、流式进度、响应体 API 与 impit 等价。

## 客户端实现（TS）
- 新增 e:\curlnapi\research\curlnapi-client.ts（参考现有 [examples/curlnapi-client.ts](file:///e:/curlnapi/examples/curlnapi-client.ts)）：
  - export class CurlNapiHttpClient implements BaseHttpClient。
  - getClient(options)：传 followRedirects:false，按除 cookieJar 外的选项复用 Impit（LruCache）。
  - intoHeaders/intoImpitBody：与 impit-client 等价（Headers 扁平化；支持 generator/Readable→Web ReadableStream）。
  - getResponse：递归处理 30x，301/302 的 POST→GET；303 非 HEAD 改 GET；记录 redirectUrls；限制 maxRedirects。
  - sendRequest：text/json/bytes 三态与 impit 对齐；返回 headers/status/url/body/complete/trailers。
  - stream：Readable.fromWeb(response.body)，提供下载进度（content-length）。

## JS 包装修正（必要）
- 在 [curlnapi-node/index.wrapper.js](file:///e:/curlnapi/curlnapi-node/index.wrapper.js) 增强 CookieJar 同步（与 impit 行为对齐）：
  - 请求前：若提供 ToughCookieJar，调用 native.setCookies([...cookieStrings])（从 cookieJar 生成 Netscape 行格式）。
  - 响应后：调用 native.getCookies() 并写回 ToughCookieJar（逐条 setCookie）。
  - 保留 Headers 归一化与 AbortSignal 兼容。

## 原生改动（可选增强）
- [addon.cc](file:///e:/curlnapi/addon.cc) 两项可选增强以更贴近 impit：
  - 流式响应：将当前“一次性缓冲+注入 ReadableStream”改为分块写入（在 write_cb 中逐块推送到 JS ReadableStream），以实现真实的进度与流式处理。
  - 统一 cookie 接口：增加对传入 cookieJar（JS 函数）的直接支持或保留 set/get 接口即可（优先在 wrapper 完成同步，不强制原生改）。

## 类型与 DX
- 增补简版 d.ts（e:\curlnapi\curlnapi-node\index.d.ts）：导出 Impit、ImpitResponse、ImpitOptions、RequestInit、HttpMethod 的最小类型签名，使 TS 客户端零 any。

## 测试与验证
- 单测：
  - 301/302/303 改写与 maxRedirects；text/json/bytes；Headers 扁平化；Body 归一化。
  - CookieJar：请求前注入、响应后回写。
  - 进度：有/无 content-length 的百分比与数值稳定性。
- 集成：在 Crawlee 的 BasicCrawler 注入 CurlNapiHttpClient，抓取公开页面；参考 [examples/test_crawlee.ts](file:///e:/curlnapi/examples/test_crawlee.ts)。

## 交付物
- e:\curlnapi\research\curlnapi-client.ts
- （必要）更新 index.wrapper.js 的 Cookie 同步逻辑；（可选）addon.cc 的流式增强
- （可选）e:\curlnapi\curlnapi-node\index.d.ts
- 测试用例与简单使用说明