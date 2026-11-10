import type { OAuthClientMeta, QuotaTokenState } from './quota.js';
/** 凭据目录（相对 home）。 */
export declare const ACP_HOME_SUBPATH: readonly [".gemini", "antigravity-acp"];
/** CLI 登录态文件（只读来源）。 */
export declare const CLI_TOKEN_SUBPATH: readonly [".gemini", "antigravity-cli", "antigravity-oauth-token"];
export declare const ACP_TOKEN_FILENAME = "acp_token.json";
export declare const ACP_SETTINGS_FILENAME = "settings.json";
export declare const ACP_TOKEN_URI = "https://oauth2.googleapis.com/token";
/** 官方 consumer 登录态所需 scope（与 CLI 同源）。 */
export declare const ACP_SCOPES: readonly ["https://www.googleapis.com/auth/cloud-platform", "https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/aicode"];
/** ACP server 从 settings.json 推断的认证方式 id。 */
export declare const ACP_AUTH_TYPE = "oauth-personal";
/** `acp_token.json` 的规范形态（CredentialInfo 六字段 + 可选 access token 缓存）。 */
export interface AcpCredentialDocument {
    client_id: string;
    client_secret: string;
    refresh_token: string;
    token_uri: string;
    scopes: readonly string[];
    project_id?: string;
    /** google-auth 序列化形态的 access token；带上可省掉 server 侧一次静默换发。 */
    token?: string;
    expiry?: string;
}
export interface BuildAcpCredentialInput {
    client: OAuthClientMeta;
    state: QuotaTokenState;
    /** 已知项目 id；未知则省略，由 server 自行 loadCodeAssist 解析。 */
    projectId?: string;
    tokenUri?: string;
}
export declare function buildAcpCredentialDocument(input: BuildAcpCredentialInput): AcpCredentialDocument;
/** settings.json 形态：只声明认证方式，不碰用户的 gcp 等字段。 */
export declare function buildAcpSettingsDocument(): {
    auth: {
        type: string;
    };
};
/** 判定既有 `acp_token.json` 是否已含可用刷新凭据（六字段齐备即可，token 可缺）。 */
export declare function readAcpCredentialState(raw: unknown): {
    usable: boolean;
    projectId?: string;
    state: QuotaTokenState;
};
/** 读取既有 settings.json 的 auth.type；不存在/不可解析返回 undefined。 */
export declare function readSettingsAuthType(raw: unknown): string | undefined;
export type AcpCredentialStatus = 'existing' | 'refreshed' | 'imported' | 'unavailable';
export interface AcpCredentialResult {
    /** true = 登录态已就绪，调用方可以跳过 ACP `authenticate`。 */
    ready: boolean;
    status: AcpCredentialStatus;
    /** settings.json 里最终生效的认证方式。 */
    authType: string;
    tokenPath: string;
    settingsPath: string;
    /** 本次是否新写了 settings.json。 */
    settingsWritten: boolean;
    /** 失败原因（已脱敏，绝不含 token）；ready 为 true 时为 undefined。 */
    note?: string;
}
export interface AcpCredentialDeps {
    homedir?: () => string;
    env?: Readonly<Record<string, string | undefined>>;
    /** 换发 access token；默认用 quota.ts 的 OAuth 刷新。 */
    refresh?: (state: QuotaTokenState, client: OAuthClientMeta) => Promise<QuotaTokenState>;
    /** 解析 OAuth client 元数据；默认走 quota.ts（env 覆盖 → 官方二进制内嵌）。 */
    resolveClient?: (env: Readonly<Record<string, string | undefined>>) => Promise<OAuthClientMeta | undefined>;
    /** 目标 ACP server 版本（定位缓存里已解压的官方二进制）；缺省用默认版本。 */
    acpVersion?: string;
    /** 插件设置里选定的官方 CLI 路径，用于一致地发现 OAuth client 元数据。 */
    cliPath?: string;
    /** 解析项目 id；默认不解析（省略 project_id，由 server 自行解析）。 */
    resolveProjectId?: (accessToken: string) => Promise<string | undefined>;
    /** 换发所用的 fetch（插件代理在 index.ts 装好）；缺省为全局 fetch。 */
    fetchImpl?: typeof fetch;
    readFileImpl?: (path: string) => Promise<string>;
    writeFileImpl?: (path: string, data: string) => Promise<void>;
    mkdirImpl?: (path: string) => Promise<void>;
    now?: () => number;
    /** 既有 access token 距过期不足该毫秒数时提前换发。 */
    freshnessMarginMs?: number;
}
/**
 * 准备 `acp_token.json` 与 `settings.json`。永不抛异常：任何准备失败都收敛成
 * `ready: false`，让调用方退回官方浏览器登录流程。
 */
export declare function ensureAcpCredentials(deps?: AcpCredentialDeps): Promise<AcpCredentialResult>;
