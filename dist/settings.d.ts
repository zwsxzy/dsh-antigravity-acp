/**
 * 插件配置接口与 schemastery Schema。
 * schema 写法对准已安装 @deepseek-ai/schemastery 3.18.x 的实际导出。
 */
import Schema from '@deepseek-ai/schemastery';
import type { Volatile } from '@deepseek-ai/cordis';
/** 单个模型目录条目上的用户设置；键是 DSH 模型选择器里的模型 ID。 */
export interface ModelOverride {
    /** 是否出现在 DSH 模型选择器；省略等同启用。停用不删除目录条目，仍可被会话请求。 */
    enabled?: boolean;
    /** 该模型的默认思考档位；未在 DSH 思考强度菜单选择时使用，省略按官方默认（medium）。 */
    effort?: 'low' | 'medium' | 'high';
    /** 显示名覆盖；省略用官方目录名称。 */
    name?: string;
    /** 映射到官方模型 ID，原样写入 ACP 会话，优先于家族 + 档位路由。 */
    target?: string;
}
export interface AntigravityHostConfig {
    /** Maximum independent ACP workers, started on demand. */
    maxConcurrentSessions?: number;
    /** Maximum wait for an available worker. */
    queueTimeoutMs?: number;
    /** Explicit official CLI path, re-detected for manual reads. */
    agyCliPath?: string;
    /** 插件启用时提前启动 ACP 连接并保留给聊天使用；不发送模型消息。 */
    autoWarmup?: boolean;
    /** 官方 agy-acp-server 可执行文件路径；优先级高于 AGY_ACP_BIN 与自动下载。 */
    binaryPath?: string;
    /** 未找到本地二进制时是否自动从 dl.google.com 下载（默认 true）。 */
    autoDownload?: boolean;
    /** 传给 ACP server 的额外命令行参数。 */
    extraArgs?: string[];
    /** 自动下载的目标版本（默认 1.4.0）。 */
    acpVersion?: string;
    /** 单个 ACP 请求默认超时（毫秒）。 */
    requestTimeoutMs?: number;
    /** initialize 握手等待上限（毫秒）；官方进程冷启动可达 1 分钟。 */
    handshakeTimeoutMs?: number;
    /**
     * authenticate（oauth-personal，需人工在浏览器完成授权）的等待上限（毫秒）。
     * 独立于 requestTimeoutMs，默认 5 分钟。
     */
    authTimeoutMs?: number;
    /** 单轮 session/prompt 的等待上限（毫秒）；ACP 回合可能很长，默认 30 分钟。 */
    promptTimeoutMs?: number;
    /** 并发 MCP tools/call 的聚合窗口（毫秒），决定同一轮携带多少 tool-call block。 */
    bridgeParkSettleMs?: number;
    /**
     * 按模型 ID 的目录设置：是否出现在 DSH 模型选择器、默认思考档位、显示名、
     * 官方模型 ID 映射。只作用于目录中已存在的条目，不新增自造模型。
     */
    modelOverrides?: Record<string, ModelOverride>;
    /**
     * 官方进程出网代理（如 http://127.0.0.1:7890）。留空继承宿主代理，宿主未配置才直连；
     * 填入后同时注入大小写两套 *_PROXY 与 NO_PROXY。
     */
    proxyUrl?: string;
    /**
     * 代理排除列表（逗号分隔）。localhost/127.0.0.1/::1 始终自动排除，
     * 因为私有 MCP 桥与 OAuth 回调都在 loopback 上。
     */
    proxyBypass?: string;
    /**
     * 复用同一个 ACP 会话：同一 DSH 对话的后续回合只发送新增消息，不再每轮
     * `session/new` 并重放全部历史。历史被压缩/回退、模型或工具目录变化时
     * 仍会受控重建。关闭后回到「每轮新会话 + 全量重放」的旧行为。
     */
    reuseSessions?: boolean;
    /**
     * 跨进程恢复 ACP 会话：插件/宿主重启后，若上次留下会话映射，尝试用
     * `session/load` 恢复该对话而不是从零重建。依赖 agent 的 `loadSession`
     * 能力；agent 侧历史可能与 DSH 当前历史不一致，失败时自动回退重建。
     */
    resumeSessions?: boolean;
    /**
     * 用户取消（停止按钮）后是否保留官方进程：默认关闭（立即回收，下一轮冷启动）。
     * 开启后先等 `cancelGraceMs` 让 agent 确认停止；确认了就只丢弃会话、保留进程。
     */
    keepProcessAfterCancel?: boolean;
    /** 取消后的确认宽限（毫秒）；0 表示不等待、立即回收。 */
    cancelGraceMs?: number;
    /** 保留进程的最长空闲时间（毫秒），超时回收；0 表示不设上限。 */
    idleRecycleMs?: number;
    /**
     * 代理模式开关（默认关闭）：开启后本 bundle 的第二行组件
     * `antigravity-proxy-router` 接管模型生成——直接持有 OAuth 凭据、
     * 以 agy CLI 线身份直连 Cloud Code Assist，不再经过官方 ACP 进程；
     * 同时宿主行注销 `antigravity-acp` 路由，两种模式互斥。
     * 关闭（默认）时一切行为与现在相同：生成走官方 ACP。
     */
    proxyMode?: boolean;
    /**
     * 是否允许额度取数调用本机官方 agy CLI（默认关闭）。
     * 关闭时任何模式都不 spawn agy：代理模式套餐额度用代理账户，ACP 模式走
     * Cloud Code Assist HTTP，AI Credits 不查询。
     * 开启后 ACP 模式才运行 `agy -p /usage` 与 `agy -p /credits`；代理模式
     * 套餐额度仍用代理账户，只有 AI Credits 调用 `agy -p /credits`。
     */
    cliQuotaEnabled?: boolean;
}
export declare const LIVE_SETTING_KEYS: readonly ["autoWarmup", "reuseSessions", "modelOverrides", "proxyUrl", "proxyBypass", "agyCliPath", "resumeSessions", "keepProcessAfterCancel", "cancelGraceMs", "idleRecycleMs", "proxyMode", "cliQuotaEnabled"];
export type LiveSettingKey = typeof LIVE_SETTING_KEYS[number];
export type AntigravityPluginConfig = Omit<AntigravityHostConfig, LiveSettingKey> & {
    [K in LiveSettingKey]?: AntigravityHostConfig[K] | Volatile<AntigravityHostConfig[K]>;
};
/** Keep references live; callers may spread this view to capture one operation. */
export declare function liveHostConfig(config: AntigravityPluginConfig): AntigravityHostConfig;
/** 官方思考档位；与 runtime/agy-cli.ts 的 AGY_REASONING_EFFORTS 一致。 */
export declare const MODEL_EFFORTS: readonly ["low", "medium", "high"];
export declare const Config: Schema<Schemastery.ObjectS<NoInfer<{
    maxConcurrentSessions: Schema<number, number, "defined">;
    queueTimeoutMs: Schema<number, number, "defined">;
    agyCliPath: Schema<string, string, "volatile">;
    autoWarmup: Schema<boolean, boolean, "volatile-defined">;
    binaryPath: Schema<string, string, "plain">;
    autoDownload: Schema<boolean, boolean, "defined">;
    extraArgs: Schema<string[], string[], "defined">;
    acpVersion: Schema<string, string, "defined">;
    requestTimeoutMs: Schema<number, number, "defined">;
    handshakeTimeoutMs: Schema<number, number, "defined">;
    authTimeoutMs: Schema<number, number, "defined">;
    promptTimeoutMs: Schema<number, number, "defined">;
    bridgeParkSettleMs: Schema<number, number, "defined">;
    modelOverrides: Schema<Record<string, ModelOverride>, Record<string, ModelOverride>, "volatile-defined">;
    proxyUrl: Schema<string, string, "volatile">;
    proxyBypass: Schema<string, string, "volatile">;
    reuseSessions: Schema<boolean, boolean, "volatile-defined">;
    resumeSessions: Schema<boolean, boolean, "volatile-defined">;
    keepProcessAfterCancel: Schema<boolean, boolean, "volatile-defined">;
    cancelGraceMs: Schema<number, number, "volatile-defined">;
    idleRecycleMs: Schema<number, number, "volatile-defined">;
    proxyMode: Schema<boolean, boolean, "volatile-defined">;
    cliQuotaEnabled: Schema<boolean, boolean, "volatile-defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    maxConcurrentSessions: Schema<number, number, "defined">;
    queueTimeoutMs: Schema<number, number, "defined">;
    agyCliPath: Schema<string, string, "volatile">;
    autoWarmup: Schema<boolean, boolean, "volatile-defined">;
    binaryPath: Schema<string, string, "plain">;
    autoDownload: Schema<boolean, boolean, "defined">;
    extraArgs: Schema<string[], string[], "defined">;
    acpVersion: Schema<string, string, "defined">;
    requestTimeoutMs: Schema<number, number, "defined">;
    handshakeTimeoutMs: Schema<number, number, "defined">;
    authTimeoutMs: Schema<number, number, "defined">;
    promptTimeoutMs: Schema<number, number, "defined">;
    bridgeParkSettleMs: Schema<number, number, "defined">;
    modelOverrides: Schema<Record<string, ModelOverride>, Record<string, ModelOverride>, "volatile-defined">;
    proxyUrl: Schema<string, string, "volatile">;
    proxyBypass: Schema<string, string, "volatile">;
    reuseSessions: Schema<boolean, boolean, "volatile-defined">;
    resumeSessions: Schema<boolean, boolean, "volatile-defined">;
    keepProcessAfterCancel: Schema<boolean, boolean, "volatile-defined">;
    cancelGraceMs: Schema<number, number, "volatile-defined">;
    idleRecycleMs: Schema<number, number, "volatile-defined">;
    proxyMode: Schema<boolean, boolean, "volatile-defined">;
    cliQuotaEnabled: Schema<boolean, boolean, "volatile-defined">;
}>>, "plain">;
