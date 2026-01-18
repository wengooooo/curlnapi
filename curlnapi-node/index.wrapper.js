const { castToTypedArray } = require('./request.js')
let native = null
try {
  native = require('./index.js')
} catch (e) {
  throw new Error(`curl_cffi couldn't load native bindings. Set VERBOSE=1 for details.`, process.env['VERBOSE'] === '1' ? { cause: e } : undefined)
}

function canonicalizeHeaders(headers) {
  if (typeof Headers !== 'undefined' && headers instanceof Headers) return [...headers.entries()]
  if (Array.isArray(headers)) return headers
  if (headers && typeof headers === 'object') return Object.entries(headers)
  return []
}

function headersToObject(headers) {
  if (!headers) return undefined
  const entries = canonicalizeHeaders(headers)
  return Object.fromEntries(entries)
}

async function parseFetchOptions(resource, init) {
  let url
  let options = { ...init }
  if (typeof Request !== 'undefined' && resource instanceof Request) {
    url = resource.url
    options = { method: resource.method, headers: resource.headers, body: resource.body, ...init }
  } else if (resource && resource.toString) {
    url = resource.toString()
  } else {
    url = resource
  }
  const headerEntries = canonicalizeHeaders(options?.headers)
  if (options?.body) {
    const { body, type } = await castToTypedArray(options.body)
    options.body = body
    if (type && !headerEntries.some(([k]) => String(k).toLowerCase() === 'content-type')) {
      headerEntries.push(['Content-Type', type])
    }
  } else {
    delete options.body
  }
  const out = {
    url,
    method: options.method,
    headers: Object.fromEntries(headerEntries),
    body: options.body,
    signal: options.signal,
  }
  if (typeof options.timeout === 'number') out.timeout = options.timeout
  return out
}

class Impit extends native.Impit {
  constructor(options) {
    const jsCookieJar = options?.cookieJar
    super({
      ...options,
      headers: headersToObject(options?.headers),
    })
    this._jsCookieJar = jsCookieJar
  }
  async fetch(resource, init) {
    const { url, signal, ...options } = await parseFetchOptions(resource, init)
    if (this._jsCookieJar) {
      try {
        const cookieStr = await this._jsCookieJar.getCookieString?.(url)
        if (cookieStr && !options.headers.some(([k]) => String(k).toLowerCase() === 'cookie')) {
          options.headers.push(['Cookie', cookieStr])
        }
      } catch {}
    }
    const waitForAbort = new Promise((_, reject) => {
      signal?.throwIfAborted?.()
      signal?.addEventListener?.('abort', () => reject(signal.reason), { once: true })
    })
    const response = super.fetch(url, options)
    const originalResponse = await Promise.race([response, waitForAbort])
    signal?.throwIfAborted?.()
    signal?.addEventListener?.('abort', () => { originalResponse.abort() })
    const rawHeaders = originalResponse.headers
    if (typeof Headers !== 'undefined') {
      Object.defineProperty(originalResponse, 'headers', { value: new Headers(originalResponse.headers) })
    }
    if (this._jsCookieJar && Array.isArray(rawHeaders)) {
      try {
        for (const [k, v] of rawHeaders) {
          if (String(k).toLowerCase() === 'set-cookie') {
            await this._jsCookieJar.setCookie?.(v, url)
          }
        }
      } catch {}
    }
    return originalResponse
  }
}

module.exports.Impit = Impit
module.exports.ImpitWrapper = native.ImpitWrapper
// ImpitResponse is an interface in TypeScript, not a runtime class. 
// We export a dummy object for compatibility if needed, but it's not strictly required at runtime.
module.exports.ImpitResponse = class ImpitResponse {} 
module.exports.Browser = {
  Chrome: 'chrome',
  Firefox: 'firefox',
}
module.exports.HttpMethod = {
  GET: 'GET',
  POST: 'POST',
  PUT: 'PUT',
  DELETE: 'DELETE',
  HEAD: 'HEAD',
  OPTIONS: 'OPTIONS',
  PATCH: 'PATCH',
  TRACE: 'TRACE',
  CONNECT: 'CONNECT',
}
