const { Readable } = require('node:stream')
const native = require('../curlnapi-node')

const Browser = {
  Chrome: 'chrome',
  Firefox: 'firefox',
}

class ImpitHttpClient {
  constructor(options) {
    this.impitOptions = options || {}
    this.maxRedirects = (options && options.maxRedirects) || 10
    this.followRedirects = (options && options.followRedirects) !== false
    const opts = {
      dohUrl: 'https://cloudflare-dns.com/dns-query',
      ...this.impitOptions,
      browser: this.impitOptions.browser || Browser.Chrome,
      headers: this.impitOptions.headers || {},
      ignoreTlsErrors: !!this.impitOptions.ignoreTlsErrors,
      followRedirects: this.followRedirects,
    }
    this.client = new native.Impit(opts)
  }

  intoHeaders(headers) {
    if (!headers) return undefined
    const out = {}
    for (const k of Object.keys(headers)) {
      const v = headers[k]
      if (Array.isArray(v)) out[k] = v.filter(x => x !== undefined).join(', ')
      else if (v !== undefined) out[k] = v
    }
    return out
  }

  intoImpitBody(body) {
    if (body == null) return undefined
    if (typeof body === 'string' || Buffer.isBuffer(body)) return body
    return undefined
  }

  shouldRewriteRedirectToGet(httpStatus, method) {
    if ([301, 302].includes(httpStatus)) return method === 'POST'
    if (httpStatus === 303) return method !== 'HEAD'
    return false
  }

  async getResponse(request, redirects) {
    const count = (redirects && redirects.redirectCount) || 0
    if (count > this.maxRedirects) {
      throw new Error(`Too many redirects, maximum is ${this.maxRedirects}.`)
    }
    const url = typeof request.url === 'string' ? request.url : request.url.href
    const mergedHeaders = {
      ...(this.impitOptions.headers || {}),
      ...(request.headers || {}),
    }
    const init = {
      method: request.method,
      headers: this.intoHeaders(request.headers),
      body: this.intoImpitBody(request.body),
    }
    const reqTimeout = request && request.timeout && request.timeout.request
    if (reqTimeout != null) init.timeout = reqTimeout
    const response = await this.client.fetch(url, init)
    if (this.followRedirects && response.status >= 300 && response.status < 400) {
      const locationPair = (response.headers || []).find(([k]) => String(k).toLowerCase() === 'location')
      const location = locationPair ? locationPair[1] : undefined
      const redirectUrl = new URL(location || '', request.url)
      if (!location) throw new Error('Redirect response missing location header.')
      return this.getResponse(
        {
          ...request,
          method: this.shouldRewriteRedirectToGet(response.status, request.method) ? 'GET' : request.method,
          url: redirectUrl.href,
        },
        {
          redirectCount: count + 1,
          redirectUrls: [ ...(redirects && redirects.redirectUrls) || [], redirectUrl ],
        }
      )
    }
    return { response, redirectUrls: (redirects && redirects.redirectUrls) || [] }
  }

  async sendRequest(request) {
    const { response, redirectUrls } = await this.getResponse(request)
    let responseBody
    const type = request.responseType
    if (type === 'text') responseBody = await response.text()
    else if (type === 'json') responseBody = await response.json()
    else if (type === 'buffer') responseBody = await response.bytes()
    else throw new Error('Unsupported response type.')
    const headersObj = {}
    for (const [k,v] of response.headers || []) {
      headersObj[k] = v
    }
    return {
      headers: headersObj,
      statusCode: response.status,
      url: response.url,
      request,
      redirectUrls,
      trailers: {},
      body: responseBody,
      complete: true,
    }
  }

  getStreamWithProgress(response) {
    const responseStream = Readable.fromWeb(response.body)
    let transferred = 0
    const headerPair = (response.headers || []).find(([k]) => String(k).toLowerCase() === 'content-length')
    const total = Number((headerPair && headerPair[1]) || 0)
    responseStream.on('data', (chunk) => { transferred += chunk.length })
    const getDownloadProgress = () => ({
      percent: Math.round((transferred / total) * 100),
      transferred,
      total,
    })
    return [responseStream, getDownloadProgress]
  }

  async stream(request) {
    const { response, redirectUrls } = await this.getResponse(request)
    const [stream, getDownloadProgress] = this.getStreamWithProgress(response)
    const headersObj = {}
    for (const [k,v] of response.headers || []) {
      headersObj[k] = v
    }
    return {
      request,
      url: response.url,
      statusCode: response.status,
      stream,
      complete: true,
      get downloadProgress() { return getDownloadProgress() },
      uploadProgress: { percent: 100, transferred: 0 },
      redirectUrls,
      headers: headersObj,
      trailers: {},
    }
  }
}

module.exports = { ImpitHttpClient, Browser }
