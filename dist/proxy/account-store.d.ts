import type { QuotaTokenState } from '../runtime/quota.js';
export declare const PROXY_ACCOUNT_FILE = "proxy-account.json";
/** 提前多少毫秒视为将过期并触发换发（与额度取数同一口径）。 */
export declare const PROXY_TOKEN_EXPIRY_MARGIN_MS = 60000;
export interface ProxyCredential {
    accessToken: string;
    refreshToken?: string;
    /** 过期时刻（epoch 毫秒）；缺省视为不过期，由请求失败兜底。 */
    expiresAt?: number;
    projectId?: string;
    email?: string;
    source: 'cli-import' | 'login';
    updatedAt: string;
}
export interface ProxyAccountStoreDeps {
    cacheDir: string;
    readFileImpl?: (path: string) => Promise<string>;
    writeFileImpl?: (path: string, data: string) => Promise<void>;
    renameImpl?: (from: string, to: string) => Promise<void>;
    removeImpl?: (path: string) => Promise<void>;
    mkdirImpl?: (path: string) => Promise<void>;
    chmodImpl?: (path: string, mode: number) => Promise<void>;
    now?: () => number;
}
export declare function proxyAccountPath(cacheDir: string): string;
/** 解析落盘副本；access 与 refresh 至少其一，缺来源返回 undefined（按未登录处理，不猜）。 */
export declare function parseProxyCredential(raw: unknown): ProxyCredential | undefined;
export declare function isProxyCredentialUsable(credential: ProxyCredential | undefined, nowMs: number, marginMs?: number): boolean;
/** 把官方 CLI 登录态映射成代理凭据。
 *
 * 只有 refresh_token 也允许导入：适配器在使用前会先换发 access token，
 * 与额度取数对官方登录态的口径一致（access 过期 ≠ 未登录）。
 */
export declare function proxyCredentialFromCliToken(state: QuotaTokenState, nowMs: number): ProxyCredential | undefined;
export declare class ProxyAccountStore {
    private readonly deps;
    private memory;
    private loaded;
    private loading?;
    private generation;
    private writes;
    constructor(deps: ProxyAccountStoreDeps);
    private get now();
    private get path();
    /** 内存优先；未加载过则读盘一次。读不到即未登录。 */
    load(): Promise<ProxyCredential | undefined>;
    peek(): ProxyCredential | undefined;
    usable(marginMs?: number): ProxyCredential | undefined;
    /** 写入内存与磁盘；调用方保证不含凭据以外的敏感字段。 */
    save(credential: ProxyCredential): Promise<void>;
    /** 只更新项目 id / 邮箱等派生字段（换发与目录发现后回写）。 */
    patch(patch: Partial<Pick<ProxyCredential, 'projectId' | 'email' | 'accessToken' | 'refreshToken' | 'expiresAt'>>): Promise<ProxyCredential | undefined>;
    clear(): Promise<void>;
}
/** 读官方 CLI 登录态并映射为代理凭据；任何失败返回 undefined（不抛）。 */
export declare function importCliCredential(tokenPath: string, nowMs: number, readFileImpl?: (path: string) => Promise<string>): Promise<ProxyCredential | undefined>;
