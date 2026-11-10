export declare const AGY_PROXY_USER_AGENT: string;
/** 代理模式允许直连的上游端点（origin + pathname 精确匹配）。 */
export declare const PROXY_WIRE_ORIGINS: readonly string[];
export declare const PROXY_WIRE_PATHS: readonly string[];
export type WireHeaderPair = readonly [name: string, value: string];
export declare class WireIdentityError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
export interface ProxyWireRequest {
    /** 只接受裸 access token 或完整 `Bearer …` 值；不会进入任何错误消息。 */
    readonly authorization?: string;
    readonly body: string | Uint8Array;
    /** OAuth token 端点用表单编码；缺省 JSON。 */
    readonly contentType?: string;
}
/** 校验端点在白名单内；query 只允许 `?alt=sse`。 */
export declare function assertProxyEndpoint(url: string): URL;
/**
 * 生成 agy CLI 形态的请求头序列（固定顺序，调用方不能增删改）。
 * 返回值冻结；`User-Agent` 恒为 {@link AGY_PROXY_USER_AGENT}。
 */
export declare function buildProxyHeaderPairs(url: string, request: ProxyWireRequest): readonly WireHeaderPair[];
/** 把固定头序列序列化成字面 HTTP/1.1 请求字节（chunked 或 Content-Length）。 */
export declare function serializeProxyRequest(url: string, request: ProxyWireRequest): Uint8Array;
