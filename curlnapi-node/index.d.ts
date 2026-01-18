export type HttpMethod =
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'DELETE'
  | 'PATCH'
  | 'HEAD'
  | 'OPTIONS';

export interface ImpitOptions {
  timeout?: number;
  followRedirects?: boolean;
  debug?: boolean;
  browser?: string;
  proxyUrl?: string;
  userAgent?: string;
  referer?: string;
  maxRedirects?: number;
  httpVersion?: number | '2' | '3' | 'h2' | 'h3';
  ipResolve?: 'v4' | 'v6' | string;
  dohUrl?: string;
  ignoreTlsErrors?: boolean;
  headers?: Record<string, string>;
  cookieJar?: {
    setCookie?: (cookieStr: string, url: string) => Promise<any> | any;
    getCookieString?: (url: string) => Promise<string> | string;
  } | undefined;
}

export interface RequestInit {
  method?: HttpMethod;
  headers?: Headers | Record<string, string> | Array<[string, string]>;
  body?: any;
  timeout?: number;
}

export interface ImpitResponse {
  status: number;
  url: string;
  headers: Headers | Array<[string, string]>;
  text(): Promise<string>;
  json(): Promise<any>;
  bytes(): Promise<Uint8Array>;
  body: ReadableStream<any>;
  abort(): void;
}

export class Impit {
  constructor(options?: ImpitOptions);
  fetch(url: string, init?: RequestInit): Promise<ImpitResponse>;
}

export const ImpitWrapper: typeof Impit;
export const ImpitResponse: any;
