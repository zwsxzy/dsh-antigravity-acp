import type { ProxyCredential } from './account-store.js';
export declare const PROXY_OAUTH_CALLBACK_PORT = 51121;
export declare const PROXY_OAUTH_CALLBACK_PATH = "/oauth-callback";
export declare const PROXY_OAUTH_TTL_MS: number;
export declare const PROXY_ACCOUNT_REQUEST_TIMEOUT_MS = 15000;
export type ProxyOAuthPhase = 'idle' | 'pending' | 'finishing' | 'success' | 'cancelled' | 'expired' | 'failed' | 'port-conflict';
export type ProxyOAuthErrorCode = 'cancelled' | 'expired' | 'port-conflict' | 'state-mismatch' | 'missing-code' | 'oauth-error' | 'token-exchange-failed' | 'project-detection-failed' | 'credential-save-failed' | 'invalid-callback-url' | 'internal';
export declare class ProxyOAuthError extends Error {
    readonly code: ProxyOAuthErrorCode;
    constructor(code: ProxyOAuthErrorCode, message: string);
}
export interface ProxyOAuthStatus {
    phase: ProxyOAuthPhase;
    authorizationUrl?: string;
    expiresAt?: string;
    errorCode?: ProxyOAuthErrorCode;
    /** 仅由本地受控错误生成，不包含上游响应或凭据。 */
    errorMessage?: string;
}
export interface ProxyOAuthToken {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    email?: string;
}
export interface ProxyOAuthFlowOptions {
    fetchImpl?: typeof fetch;
    ttlMs?: number;
    now?: () => number;
    randomBytesImpl?: (size: number) => Uint8Array;
    listenerFactory?: ProxyLoopbackListenerFactory;
    exchangeCode?: (input: {
        code: string;
        verifier: string;
        signal: AbortSignal;
    }) => Promise<ProxyOAuthToken>;
    /** 登录成功后的落盘回调（写 ProxyAccountStore）。 */
    commit?: (token: ProxyOAuthToken, signal: AbortSignal) => Promise<ProxyCredential>;
}
export interface ProxyLoopbackCallbackRequest {
    method: string;
    host?: string;
    url: string;
}
export interface ProxyLoopbackCallbackResponse {
    status: number;
    headers: Readonly<Record<string, string>>;
    body: string;
}
export type ProxyLoopbackHandler = (request: ProxyLoopbackCallbackRequest) => Promise<ProxyLoopbackCallbackResponse>;
export interface ProxyLoopbackListener {
    close(): Promise<void> | void;
    port?: number;
}
export interface ProxyLoopbackListenerFactory {
    listen(handler: ProxyLoopbackHandler): Promise<ProxyLoopbackListener>;
}
export interface ProxyOAuthFlow {
    start(): Promise<{
        authorizationUrl: string;
        expiresAt: string;
    }>;
    status(): ProxyOAuthStatus;
    completeCallbackUrl(callbackUrl: string): Promise<{
        completed: boolean;
        errorCode?: ProxyOAuthErrorCode;
    }>;
    cancel(): Promise<ProxyOAuthStatus>;
    dispose(): Promise<void>;
}
export declare function createProxyOAuthFlow(options?: ProxyOAuthFlowOptions): ProxyOAuthFlow;
/** Google token 交换；响应只在 Host 内存解析，错误消息不含凭据。 */
export declare function createTokenExchanger(fetchImpl: typeof fetch, now?: () => number): ({ code, verifier, signal }: {
    code: string;
    verifier: string;
    signal: AbortSignal;
}) => Promise<ProxyOAuthToken>;
/** 用 refresh_token 换发 access token（代理感知 fetch）。 */
export declare function refreshProxyAccessToken(refreshToken: string, fetchImpl: typeof fetch, now?: () => number, signal?: AbortSignal): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
}>;
/** 只绑 127.0.0.1；生产使用官方登记端口，测试可用随机端口而保持原 Host 校验。 */
export declare function createProxyLoopbackListenerFactory(port?: number): ProxyLoopbackListenerFactory;
/** 同时约束连接与响应读取；即使注入的 fetch 忽略 signal，调用方也会按时结束。 */
export declare function withProxyAccountDeadline<T>(operation: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal, timeoutMs?: number): Promise<T>;
