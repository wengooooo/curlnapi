import { Readable } from 'node:stream';
import { type ReadableStream } from 'node:stream/web';
import { isGeneratorObject } from 'node:util/types';

import type { BaseHttpClient, HttpRequest, HttpResponse, ResponseTypes, StreamingHttpResponse } from '@crawlee/core';
import type { HttpMethod, ImpitOptions, ImpitResponse, RequestInit } from '../curlnapi-node';
import { Impit } from '../curlnapi-node';
import type { CookieJar as ToughCookieJar } from 'tough-cookie';

import { LruCache } from '@apify/datastructures';

export const Browser = {
    'Chrome': 'chrome',
    'Firefox': 'firefox',
} as const;

interface ResponseWithRedirects {
    response: ImpitResponse;
    redirectUrls: URL[];
}

/**
 * A HTTP client implementation based on the `impit library.
 */
export class CurlNapiHttpClient implements BaseHttpClient {
    private impitOptions: ImpitOptions;
    private maxRedirects: number;
    private followRedirects: boolean;

    /**
     * Enables reuse of `impit` clients for the same set of options.
     * This is useful for performance reasons, as creating
     * a new client for each request breaks TCP connection
     * (and other resources) reuse.
     */
    private clientCache: LruCache<{ client: Impit; cookieJar: ToughCookieJar }> = new LruCache({ maxLength: 10 });

    private getClient(options: ImpitOptions) {
        const { cookieJar, ...rest } = options;

        const cacheKey = JSON.stringify(rest);
        const existingClient = this.clientCache.get(cacheKey);

        if (existingClient && (!cookieJar || existingClient.cookieJar === cookieJar)) {
            return existingClient.client;
        }

        const client = new Impit(options);
        this.clientCache.add(cacheKey, { client, cookieJar: cookieJar as ToughCookieJar });

        return client;
    }


    constructor(options?: ImpitOptions & { maxRedirects?: number }) {
        this.impitOptions = options ?? {};

        this.maxRedirects = options?.maxRedirects ?? 10;
        this.followRedirects = options?.followRedirects ?? true;
    }

    /**
     * Flattens the headers of a `HttpRequest` to a format that can be passed to `impit`.
     * @param headers `SimpleHeaders` object
     * @returns `Array<[string, string]>` object
     */
    private intoHeaders<TResponseType extends keyof ResponseTypes>(
        headers?: Exclude<HttpRequest<TResponseType>['headers'], undefined>,
    ): Array<[string, string]> | undefined {
        if (!headers) {
            return undefined;
        }

        const result: Array<[string, string]> = [];

        for (const headerName of Object.keys(headers)) {
            const headerValue = headers[headerName];

            for (const value of Array.isArray(headerValue) ? headerValue : [headerValue]) {
                if (value === undefined) continue;
                result.push([headerName, value]);
            }
        }

        return result;
    }

    private intoImpitBody<TResponseType extends keyof ResponseTypes>(
        body?: Exclude<HttpRequest<TResponseType>['body'], undefined>,
    ): RequestInit['body'] {
        if (isGeneratorObject(body)) {
            return Readable.toWeb(Readable.from(body)) as any;
        }
        if (body instanceof Readable) {
            return Readable.toWeb(body) as any;
        }

        return body as any;
    }

    private shouldRewriteRedirectToGet(httpStatus: number, method: HttpRequest<any>['method']): boolean {
        // See https://github.com/mozilla-firefox/firefox/blob/911b3eec6c5e58a9a49e23aa105e49aa76e00f9c/netwerk/protocol/http/HttpBaseChannel.cpp#L4801
        if ([301, 302].includes(httpStatus)) {
            return method === 'POST';
        }

        if (httpStatus === 303) return method !== 'HEAD';

        return false;
    }

    /**
     * Common implementation for `sendRequest` and `stream` methods.
     * @param request `HttpRequest` object
     * @returns `HttpResponse` object
     */
    private async getResponse<TResponseType extends keyof ResponseTypes>(
        request: HttpRequest<TResponseType>,
        redirects?: {
            redirectCount?: number;
            redirectUrls?: URL[];
        },
    ): Promise<ResponseWithRedirects> {
        if ((redirects?.redirectCount ?? 0) > this.maxRedirects) {
            throw new Error(`Too many redirects, maximum is ${this.maxRedirects}.`);
        }

        const url = typeof request.url === 'string' ? request.url : request.url.href;

        const debug = (this.impitOptions as any).debug;
        const impit = this.getClient({
            ...this.impitOptions,
            ...(debug ? { verbose: true } : {}),
            ...(request?.cookieJar ? { cookieJar: request.cookieJar as ToughCookieJar } : {}),
            proxy: request.proxyUrl || this.impitOptions.proxyUrl,
            followRedirects: false,
        });

        if (debug) {
            console.log('[curlnapi] request', request.method, url);
            console.log('[curlnapi] request headers', request.headers || {});
        }

        const response = await impit.fetch(url, {
            method: request.method as HttpMethod,
            headers: this.intoHeaders(request.headers),
            body: this.intoImpitBody(request.body),
            timeout: (request.timeout as { request?: number })?.request,
        });

        if (debug) {
            console.log('[curlnapi] response status', response.status, response.url);
            if (response.headers instanceof Headers) {
                console.log('[curlnapi] response headers', Object.fromEntries(response.headers.entries()));
            } else if (Array.isArray(response.headers)) {
                console.log('[curlnapi] response headers', Object.fromEntries(response.headers));
            }
        }

        if (this.followRedirects && response.status >= 300 && response.status < 400) {
            const location = response.headers instanceof Headers 
                ? response.headers.get('location') 
                : (Array.isArray(response.headers) ? response.headers.find(x => x[0].toLowerCase() === 'location')?.[1] : null);

            const redirectUrl = new URL(location ?? '', request.url);

            if (!location) {
                throw new Error('Redirect response missing location header.');
            }

            return this.getResponse(
                {
                    ...request,
                    method: this.shouldRewriteRedirectToGet(response.status, request.method) ? 'GET' : request.method,
                    url: redirectUrl.href,
                },
                {
                    redirectCount: (redirects?.redirectCount ?? 0) + 1,
                    redirectUrls: [...(redirects?.redirectUrls ?? []), redirectUrl],
                },
            );
        }

        return {
            response,
            redirectUrls: redirects?.redirectUrls ?? [],
        };
    }

    /**
     * @inheritDoc
     */
    async sendRequest<TResponseType extends keyof ResponseTypes>(
        request: HttpRequest<TResponseType>,
    ): Promise<HttpResponse<TResponseType>> {
        const { response, redirectUrls } = await this.getResponse(request);

        let responseBody;

        switch (request.responseType) {
            case 'text':
                responseBody = await response.text();
                break;
            case 'json':
                responseBody = await response.json();
                break;
            case 'buffer':
                responseBody = await response.bytes();
                break;
            default:
                // Fallback: 如果没有指定类型（Crawlee 默认可能传入 undefined 或其他），优先按 text 处理，
                // 除非明确是 buffer 需求。但考虑到兼容性，许多爬虫默认期望 text。
                // 如果 request.responseType 是 undefined，Crawlee 的默认行为可能依赖于客户端实现。
                // 这里我们默认返回 text，因为 buffer 会在控制台显示为 <Buffer ...>
                try {
                    responseBody = await response.text();
                    try {
                        responseBody = JSON.parse(responseBody);
                    } catch {}
                } catch {
                    responseBody = await response.bytes();
                }
                break;
        }

        return {
            headers: Object.fromEntries(response.headers.entries()),
            statusCode: response.status,
            url: response.url,
            request,
            redirectUrls,
            trailers: {},
            body: responseBody,
            complete: true,
        };
    }

    private getStreamWithProgress(
        response: ImpitResponse,
    ): [Readable, () => { percent: number; transferred: number; total: number }] {
        const responseStream = Readable.fromWeb(response.body as ReadableStream<any>);
        let transferred = 0;
        const contentLength = response.headers instanceof Headers 
            ? response.headers.get('content-length')
            : (Array.isArray(response.headers) ? response.headers.find(x => x[0].toLowerCase() === 'content-length')?.[1] : null);
        
        const total = Number(contentLength ?? 0);
        responseStream.on('data', (chunk) => {
            transferred += chunk.length;
        });

        const getDownloadProgress = () => {
            return {
                percent: Math.round((transferred / total) * 100),
                transferred,
                total,
            };
        };

        return [responseStream, getDownloadProgress];
    }

    /**
     * @inheritDoc
     */
    async stream(request: HttpRequest): Promise<StreamingHttpResponse> {
        const { response, redirectUrls } = await this.getResponse(request);
        const [stream, getDownloadProgress] = this.getStreamWithProgress(response);

        return {
            request,
            url: response.url,
            statusCode: response.status,
            stream,
            complete: true,
            get downloadProgress() {
                return getDownloadProgress();
            },
            uploadProgress: { percent: 100, transferred: 0 },
            redirectUrls,
            headers: Object.fromEntries(response.headers.entries()),
            trailers: {},
        };
    }
}
