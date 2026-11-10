import { LlmError } from '@deepseek-ai/dsh-llm';
import { ProxyAccountStore } from './account-store.js';
import type { ProxyCredential } from './account-store.js';
import type { ProxyOAuthFlow, ProxyOAuthFlowOptions, ProxyOAuthStatus } from './oauth.js';
import type { ProxyCredentialSource } from './adapter.js';
import type { ProxyTransport } from './transport.js';
export type ProxyAccountPhase = 'signed-out' | 'pending-login' | 'signed-in' | 'login-failed';
export interface ProxyAccountSnapshot {
    phase: ProxyAccountPhase;
    message: string;
    email?: string;
    source?: ProxyCredential['source'];
    updatedAt: string;
    oauth?: ProxyOAuthStatus;
    revision?: number;
    connectionStage?: 'preparing' | 'authorizing' | 'finishing';
}
export interface ProxyAccountServiceOptions {
    cacheDir: string;
    fetchImpl?: typeof fetch;
    cliTokenPath?: string;
    log?: {
        info(message: string): void;
        warn(message: string, error?: unknown): void;
    };
    now?: () => number;
    store?: ProxyAccountStore;
    oauthFlow?: ProxyOAuthFlow;
    /** 隔离测试可替换监听与期限，仍运行实际 OAuth 流程。 */
    oauthOptions?: Pick<ProxyOAuthFlowOptions, 'listenerFactory' | 'ttlMs'>;
    /** 共享生成请求的代理感知 agy 线传输。 */
    projectTransport?: ProxyTransport;
}
export declare class ProxyAccountService implements ProxyCredentialSource {
    private readonly store;
    private readonly oauth;
    private readonly options;
    private readonly projectTransport;
    private refreshing;
    private refreshAbort?;
    private loginAbort?;
    private generation;
    private signedOut;
    private accountRevision;
    private publishedAccount;
    private readonly listeners;
    private writes;
    private lastStatus;
    constructor(options: ProxyAccountServiceOptions);
    /** 返回时 access 必须可用，且项目连接完成；失效 CLI 不阻止显式 OAuth。 */
    ensureCredential(signal?: AbortSignal): Promise<ProxyCredential | undefined>;
    credential(signal?: AbortSignal, options?: {
        forceRefresh?: boolean;
    }): Promise<ProxyCredential | undefined>;
    refresh(signal?: AbortSignal): Promise<ProxyCredential | undefined>;
    login(signal?: AbortSignal): Promise<{
        authorizationUrl?: string;
        message: string;
    }>;
    oauthStatus(): ProxyOAuthStatus;
    cancelLogin(): Promise<void>;
    logout(): Promise<void>;
    status(): ProxyAccountSnapshot;
    email(): string | undefined;
    revision(): number;
    subscribe(listener: () => void): () => void;
    dispose(): Promise<void>;
    private now;
    private cliTokenPath;
    private invalidatePending;
    private saveCredential;
    private clearCredential;
    private prepareCredential;
    private publishAccount;
    private accountChanged;
    private setStatus;
}
export declare function toProxyAccountError(error: unknown): LlmError;
