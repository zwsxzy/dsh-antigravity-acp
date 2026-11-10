/** Cloud Code Assist 内部端点前缀（方法以 `:method` 拼接，POST JSON）。 */
export declare const CODE_ASSIST_BASE_URL = "https://daily-cloudcode-pa.googleapis.com/v1internal";
/** Google OAuth 2.0 token 端点（换发 access token）。 */
export declare const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
/** 官方 CLI 登录态文件（只读）。 */
export declare const TOKEN_SUBPATH: readonly [".gemini", "antigravity-cli", "antigravity-oauth-token"];
/** 提前多少毫秒视为「将过期」并触发换发。 */
export declare const TOKEN_EXPIRY_MARGIN_MS = 60000;
/** 额度快照的内存缓存时长（毫秒）。 */
export declare const QUOTA_CACHE_MS = 300000;
/**
 * 单次 HTTP 取数（换发 token 与 Cloud Code Assist 请求）的上限（毫秒）。
 *
 * 缺这条会让「代理不通 / 网络挂起」变成永久失败：`quota-remote` 把并发的
 * `read()` 合并到同一个在途 promise 上，挂死的请求会让额度药丸一直停在
 * 「读取中」，连手动刷新也救不回来（它只是在等同一个 promise）。
 */
export declare const QUOTA_HTTP_TIMEOUT_MS = 20000;
export type QuotaErrorCode = 'token-missing' | 'token-expired' | 'refresh-unavailable' | 'refresh-failed' | 'request-failed' | 'bad-response';
/** 一个额度窗口（如「5 小时」「每周」）。 */
export interface QuotaBucket {
    name: string;
    description?: string;
    /** 窗口语义标识（官方字段 window，如 `5h`）。 */
    window?: string;
    /** 剩余比例，0..1；官方未报告时缺省。 */
    remainingFraction?: number;
    /** 剩余百分比（remainingFraction * 100，两位小数）。 */
    remainingPct?: number;
    /** 配额重置时间（ISO 8601）。 */
    resetTime?: string;
    disabled: boolean;
}
/** 一组额度（如「Gemini 模型」组）。 */
export interface QuotaGroup {
    name: string;
    description?: string;
    buckets: QuotaBucket[];
}
/** 官方 AI Credits 独立快照；未知或失败绝不伪装成零余额。 */
export interface CreditsSnapshot {
    status: 'ok' | 'unavailable' | 'error';
    updatedAt: string;
    remainingCredits?: number;
    planName?: string;
    stale?: boolean;
    staleReason?: string;
    error?: {
        code: 'cli-disabled' | 'cli-unavailable' | 'no-credit-info' | 'unsupported' | 'request-failed' | 'bad-response';
        message: string;
    };
}
/** 额度快照：成功带 groups/plan，失败带 error；credits 有独立状态。 */
export interface QuotaSnapshot {
    status: 'ok' | 'error';
    /** 取数时间（ISO 8601）。 */
    updatedAt: string;
    /** 本次刷新失败，展示的是上一次成功的数据（`staleReason` 说明失败原因）。 */
    stale?: boolean;
    staleReason?: string;
    /** 订阅档位名（loadCodeAssist 的 paidTier/currentTier.name）。 */
    plan?: string;
    groups: QuotaGroup[];
    /** 药丸请求中的公开模型与实际路由模型；仅用于选择对应额度组。 */
    requestedModel?: string;
    routeModel?: string;
    credits?: CreditsSnapshot;
    error?: {
        code: QuotaErrorCode;
        message: string;
    };
}
/** 登录态文件里我们只认这几项，其余（id_token 等）一律不读不用。 */
export interface QuotaTokenState {
    accessToken?: string;
    refreshToken?: string;
    expiry?: string;
}
/** OAuth 客户端元数据（官方安装型客户端的公开标识，不是用户凭据）。 */
export interface OAuthClientMeta {
    clientId: string;
    clientSecret: string;
}
/** 取数依赖面：全部可注入，测试用假实现，不碰真实网络与真实凭据。 */
export interface QuotaDeps {
    fetchImpl?: typeof fetch;
    readFileImpl?: (path: string) => Promise<string>;
    env?: Readonly<Record<string, string | undefined>>;
    now?: () => number;
    homedir?: () => string;
    cacheDir?: string;
    /** 可执行文件安装根；与模型/额度的数据 cacheDir 分开。 */
    installRoot?: string;
    /** 设置中显式选择的官方 CLI 路径，优先于环境变量和 PATH。 */
    cliPath?: string;
    /** 候选官方二进制路径（用于提取 OAuth client 元数据）。 */
    binaryPaths?: readonly string[];
    /**
     * 目标 ACP server 版本（用于在缓存目录里定位已解压的官方二进制）。
     * 缺省为 {@link DEFAULT_ACP_SERVER_VERSION}。
     */
    acpVersion?: string;
    baseUrl?: string;
    tokenUrl?: string;
    /** 单次 HTTP 请求上限（毫秒）；缺省 {@link QUOTA_HTTP_TIMEOUT_MS}。 */
    httpTimeoutMs?: number;
}
/** 解析登录态文件：兼容嵌套 `token.{...}` 与平铺两种历史形态。 */
export declare function parseTokenState(raw: unknown): QuotaTokenState;
/** 是否还可直接使用（缺 expiry 视为不过期，由调用方按请求失败再兜底）。 */
export declare function isTokenUsable(state: QuotaTokenState, nowMs: number, marginMs?: number): boolean;
/** 从官方二进制文本里提取 client 元数据（正则即时编译匹配，不留模块级全局状态）；取不到返回 undefined（不猜值）。 */
export declare function parseOAuthClientFromBinary(text: string): OAuthClientMeta | undefined;
/**
 * 解析 OAuth client 元数据：环境变量优先，其次扫描官方二进制。
 * 两者都拿不到就返回 undefined —— 由调用方报「无法换发 token」，绝不编造 client。
 */
export declare function resolveOAuthClient(deps?: QuotaDeps): Promise<OAuthClientMeta | undefined>;
/** 用 refresh_token 换发 access_token（只在内存中使用，不写回登录文件）。 */
export declare function refreshAccessToken(state: QuotaTokenState, client: OAuthClientMeta, deps?: QuotaDeps): Promise<QuotaTokenState>;
/** 带错误码的取数失败；message 里不含凭据。 */
export declare class QuotaError extends Error {
    readonly code: QuotaErrorCode;
    /**
     * 上游 HTTP 状态码（换发 token 与 Cloud Code Assist 请求）。
     *
     * 401/403 后的「换发再试一次」必须按这个字段判断，不能去匹配 message：
     * 文案随时会改，改一次就静默丢掉重试。非 HTTP 失败（网络、JSON、缺字段）
     * 为 undefined。
     */
    readonly status: number | undefined;
    constructor(code: QuotaErrorCode, message: string, status?: number);
}
/** `loadCodeAssist` 响应里我们只认项目 id 与档位名。 */
export interface CodeAssistProject {
    projectId: string;
    plan?: string;
}
/** 拉取 Code Assist 项目与订阅档位。 */
export declare function loadCodeAssist(accessToken: string, deps?: QuotaDeps): Promise<CodeAssistProject>;
/** 解析额度汇总响应（groups/buckets）。 */
export declare function parseQuotaSummary(raw: unknown): QuotaGroup[];
/** 取一份额度快照（内存缓存 + 过期 token 换发 + 401/403 重试一次）。 */
export declare function fetchQuotaSnapshot(cache: {
    value?: QuotaSnapshot;
    at?: number;
}, deps?: QuotaDeps): Promise<QuotaSnapshot>;
