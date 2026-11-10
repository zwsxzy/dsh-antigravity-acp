import type { ResolvedProxy } from '../runtime/proxy-env.js';
export declare const PROXY_RESPONSE_HEADER_TIMEOUT_MS = 180000;
export declare const PROXY_IDLE_TIMEOUT_MS = 240000;
export declare const PROXY_TOTAL_TIMEOUT_MS = 600000;
export declare const PROXY_RESPONSE_BYTES: number;
export declare const PROXY_REQUEST_BYTES: number;
export declare const PROXY_FRAME_BYTES: number;
export type ProxyTransportErrorCode = 'cancelled' | 'timeout' | 'offline' | 'request-too-large' | 'response-too-large' | 'frame-too-large' | 'invalid-response' | 'protocol-drift' | 'authentication' | 'forbidden' | 'rate-limited' | 'upstream' | 'proxy-unsupported';
export declare class ProxyTransportError extends Error {
    readonly code: ProxyTransportErrorCode;
    readonly status?: number;
    readonly accepted: boolean;
    constructor(code: ProxyTransportErrorCode, message: string, extra?: {
        status?: number;
        accepted?: boolean;
        cause?: unknown;
    });
}
export interface ProxyTransportRequest {
    readonly url: string;
    /** 裸 access token；传输层补 `Bearer ` 前缀。 */
    readonly accessToken?: string;
    readonly body: string | Uint8Array;
    readonly contentType?: string;
    readonly signal?: AbortSignal;
    readonly responseHeaderTimeoutMs?: number;
}
export interface ProxyTransportOptions {
    /** 出网代理解析（与官方进程同一套设置）；返回 undefined 表示直连。 */
    resolveProxy?: () => ResolvedProxy | undefined;
    responseHeaderTimeoutMs?: number;
    maxRequestBytes?: number;
}
export interface ProxyTransport {
    request(input: ProxyTransportRequest): Promise<Response>;
}
export declare function createProxyTransport(options?: ProxyTransportOptions): ProxyTransport;
/** 把上游状态码折成传输错误；2xx 返回 undefined。 */
export declare function proxyStatusError(status: number): ProxyTransportError | undefined;
export interface BoundedReadOptions {
    signal?: AbortSignal;
    idleTimeoutMs?: number;
    totalTimeoutMs?: number;
    maxBytes?: number;
    maxFrameBytes?: number;
}
/** 有界读取响应体字节。 */
export declare function readProxyBytes(response: Response, options?: BoundedReadOptions): Promise<Uint8Array>;
export declare function readProxyText(response: Response, options?: BoundedReadOptions): Promise<string>;
export interface ProxySseEvent {
    readonly data: string;
    readonly event?: string;
}
/** 解析 SSE（兼容无 SSE 帧的纯 JSON 响应）；帧与总量有界。 */
export declare function iterateProxySse(response: Response, options?: BoundedReadOptions): AsyncGenerator<ProxySseEvent>;
