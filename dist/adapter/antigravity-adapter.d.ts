/**
 * Antigravity ACP 的 LlmAdapter 实现。
 *
 * 形态：官方 ACP server（Gemini 主模型）走 stdio，工具留在 DSH 侧，经插件
 * 进程内的私有 loopback MCP 桥暴露给 agent（见 ../bridge/mcp-bridge.ts）。
 *
 * DSH 是历史权威：只有输入前缀、上轮实际交付输出与路由一致才复用会话；
 * 不一致时完整重建。工具结果在同一个 ACP prompt 内经 MCP 回填。
 * 可选磁盘映射只保存 ID、计数与指纹，不存消息正文。
 */
import { LlmAdapter } from '@deepseek-ai/dsh-llm';
import type { GenerateOptions, LlmModelInfo, LlmProviderInfo, LlmResolvedModelInfo, PreparedAdapterCall, StreamChunk } from '@deepseek-ai/dsh-llm';
import type { SessionConfigOption } from '@agentclientprotocol/sdk';
import type { AgentLink, AgentLinkHandlers } from '../protocol/agent-link.js';
import { McpToolBridge } from '../bridge/mcp-bridge.js';
import type { ImageReader } from './image-content.js';
import type { AcpLifecycle } from '../runtime/lifecycle.js';
import { SessionMapStore } from '../runtime/session-map.js';
import type { SessionMapEntry } from '../runtime/session-map.js';
import type { ModelOverride } from '../settings.js';
/** DSH 侧 provider 标识符；与 cordis.patch.yml 的 id 及文档保持一致。 */
export declare const AGY_PROVIDER_ID = "antigravity-acp";
/**
 * GUI 冷启动占位模型。DSH 模型选择器会丢掉 `options.length === 0` 的 provider
 * 分组，因此未观测 ACP 会话前必须至少广告一条目录，否则设置页看不到本路由。
 * 选中该 id 时不调用 session/set_config_option，沿用官方会话默认模型。
 */
export declare const AGY_PLACEHOLDER_MODEL_ID = "server-default";
/**
 * @deprecated 兼容旧导出的错误码；temperature / stop 现在只警告并忽略，不再抛此码。
 */
export declare const AGY_UNSUPPORTED_OPTION = "UNSUPPORTED_OPTION";
/** 本 adapter 的其余原创错误码（AGY_* 体系）。 */
export declare const AGY_ADAPTER_ERROR: {
    /** 同一时刻已有活跃回合，且当前请求不是它的续轮。 */
    readonly BUSY: "AGY_BUSY";
    /** 回合需要一个模型选择器，但 ACP 会话未声明任何 model 类 configOption。 */
    readonly NO_MODEL_SELECTOR: "AGY_NO_MODEL_SELECTOR";
    /** agent 应答选模却没有确认请求的型号，不能静默使用其他模型。 */
    readonly MODEL_SELECTION_MISMATCH: "AGY_MODEL_SELECTION_MISMATCH";
};
/** MCP 桥与回合的可调参数（由 index.ts 从插件配置注入）。 */
export interface AntigravityAcpAdapterOptions {
    lifecycle?: AcpLifecycle;
    /**
     * 惰性启动工厂：返回完成 initialize + authenticate 的 AgentLink。传入的
     * handlers 必须在整个 adapter 生命周期内保持**同一对象**——index.ts 会把
     * 首个 handler 集合固化到被缓存的 AgentLink 上，后续回合只更换其内部状态。
     */
    getLink: (handlers: AgentLinkHandlers, signal?: AbortSignal, purpose?: 'warmup') => Promise<AgentLink>;
    /** 回收指定连接及其受管子进程；完成前禁止开启下一个回合。 */
    recycleLink: (link: AgentLink) => Promise<void>;
    /** 登记桥的关闭钩子（index.ts 把它挂到 ActiveAcpRuntime.bridgeTeardown）。 */
    registerBridgeTeardown: (teardown: () => Promise<void>) => void;
    /** session/prompt 等待上限（毫秒）。 */
    promptTimeoutMs?: number;
    /** 并发 MCP park 的聚合窗口（毫秒）。 */
    parkSettleMs?: number;
    /** session/new 使用的工作目录；缺省为进程 cwd。 */
    cwd?: string;
    /**
     * 按模型 ID 的目录设置：显示开关、默认思考档位、显示名与官方模型 ID 映射。
     * 只作用于目录中已存在的条目，不新增自造模型。
     */
    modelOverrides?: Record<string, ModelOverride>;
    /**
     * 冷启动目录读取（磁盘缓存）。返回 undefined 表示没有可用缓存；**不得**抛错。
     * 元数据方法不得触网，因此这里只能读本地文件。
     */
    loadCachedCatalog?: () => Promise<CachedModel[] | undefined>;
    /** 观测到真实目录后的落盘回调；失败由实现方自行吞掉。 */
    saveCatalog?: (models: readonly CachedModel[]) => Promise<void> | void;
    /** Metadata only, for sharing catalog/context observations across isolated workers. */
    onMetadataChanged?: (metadata: AdapterMetadata) => void;
    readImage?: ImageReader;
    canReadImages?: () => boolean;
    /**
     * 官方 CLI 模型清单（`agy models` 的只读取数，2026-10-16 授权仅限只读取数
     * 用途）。用于补齐会话观测之外的官方型号；失败由 adapter 吞掉。
     */
    loadCliCatalog?: () => Promise<readonly {
        id: string;
        name: string;
    }[]>;
    /**
     * 宿主日志（index.ts 接 `ctx.logger`）。仅用于**自诊断**：模型路由决策与
     * `session/set_config_option` 失败原因。缺省时不产任何日志。
     */
    log?: AdapterLog;
    /**
     * 复用同一个 ACP 会话（默认 true）：同一 DSH 对话的后续回合只发送新增消息，
     * 不再每轮 `session/new` 并重放全部历史。历史被压缩/回退、路由或工具目录
     * 变化时仍会受控重建。关闭后回到旧的「每轮新会话 + 全量重放」。
     */
    reuseSessions?: boolean;
    /**
     * 跨进程恢复 ACP 会话（默认 false）：重启后若存在会话映射，尝试
     * `session/load` 恢复而不是从零重建。需要提供 loadSessionMap / saveSessionMap。
     */
    resumeSessions?: boolean;
    /**
     * 用户取消后是否保留官方进程（默认 false：立即回收，下一轮要冷启动）。
     * 开启后先等 `cancelGraceMs` 让 agent 确认停止；确认了就只丢弃会话、保留进程。
     */
    keepProcessAfterCancel?: boolean;
    /** 取消后的确认宽限（毫秒）；0 表示不等待、立即回收，绝不复用未确认连接。 */
    cancelGraceMs?: number;
    /** 保留进程的最长空闲时间（毫秒），超时回收；0 表示不设上限。 */
    idleRecycleMs?: number;
    /** 所有 worker 共享的映射存储（含键所有权与串行提交）。 */
    sessionStore?: SessionMapStore;
    /** Capture live preferences only between ACP turns, never during tool continuation. */
    readSettings?: () => Pick<AntigravityAcpAdapterOptions, 'modelOverrides' | 'reuseSessions' | 'resumeSessions' | 'keepProcessAfterCancel' | 'cancelGraceMs' | 'idleRecycleMs' | 'sessionStore'>;
    /** 独立 adapter 的兼容读取回调；连接池必须改用共享 sessionStore。 */
    loadSessionMap?: () => Promise<Record<string, SessionMapEntry>>;
    /** 保存 ACP 会话映射；失败由实现方吞掉。 */
    saveSessionMap?: (entries: Record<string, SessionMapEntry>) => Promise<void> | void;
}
/** 适配器可用的最小日志面（与 cordis 的 `ctx.logger` 结构兼容）。 */
export interface AdapterLog {
    info(message: string): void;
    warn(message: string, error?: unknown): void;
}
/** 目录缓存条目（只含模型元数据，不含任何凭据）。 */
export interface CachedModel {
    id: string;
    name: string;
    description?: string;
    /** 实测上下文容量（usage_update.size）；官方目录不报告，故可缺省。 */
    contextWindow?: number;
}
export interface AdapterMetadata {
    catalog: CachedModel[];
    contextWindows: Array<[string, number]>;
    /** 区分真实 ACP 档位观测与 CLI 家族兜底，避免弱快照覆盖完整目录。 */
    catalogSource: 'acp' | 'fallback';
    imageSupported?: boolean;
}
export declare class AntigravityAcpAdapter extends LlmAdapter {
    #private;
    constructor(options: AntigravityAcpAdapterOptions);
    /** 设置页连接不能与正在进行的对话/工具回合竞争同一登录态。 */
    get busy(): boolean;
    get streamActive(): boolean;
    get awaitingToolResults(): boolean;
    ownsRequest(options: Pick<GenerateOptions, 'sessionId' | 'purpose'>): boolean;
    exportMetadata(): AdapterMetadata;
    importMetadata(metadata: AdapterMetadata): void;
    /** Explicit discovery is allowed to authenticate, but never sends a model prompt. */
    discoverModels(signal?: AbortSignal, interactive?: boolean): Promise<readonly LlmModelInfo[]>;
    /** 预热复用聊天的同一组 handlers 和运行时；不建临时会话、不消耗模型请求。 */
    warmup(signal?: AbortSignal, interactive?: boolean): Promise<void>;
    /** 私有 MCP 桥（诊断与测试可见；agent 侧只经 ACP mcpServers 访问它）。 */
    get bridge(): McpToolBridge;
    providerInfo(provider: string): LlmProviderInfo;
    /**
     * 模型目录：只读**已观测**的 ACP 会话配置，绝不为了列目录而启动运行时。
     *
     * 依据已安装 SDK 1.4.0 的 d.ts：`InitializeResponse` 只有 protocolVersion /
     * agentCapabilities / authMethods / agentInfo，**没有 configOptions**；模型
     * 选择器出现在 `session/new` 响应、`session/set_config_option` 响应或
     * `session/update(config_option_update)` 里。也就是说，ACP v1 没有任何
     * 「无副作用即可读到模型目录」的方法；而启动运行时必然走
     * `authenticate`（官方进程会自行弹浏览器）。
     *
     * 无真实目录时不再广告首次登录占位项；可在设置页显式连接 ACP 或拉取 CLI
     * 目录。真实目录经 `observeSessionConfigOptions` 观测并缓存。
     */
    /**
     * 本 provider 的模型目录：官方**家族**条目与用户配置的自定义 ID。
     *
     * 家族折叠（2026-10-16 用户指示）：官方把思考强度编码进模型 id
     * （`claude-opus-5-5-{low,medium,high}`），但模型选择只出家族一行，强度由
     * 思考强度菜单路由（见 #applyModelSelection）。会话观测目录与官方 CLI 清单
     * 一并折叠，同 id 去重；被排除的家族（gpt-oss-120b 临近下架）不出现。
     */
    listModels(_provider: string): Promise<readonly LlmModelInfo[]>;
    /**
     * 本 provider **不声明**任何可重试失败码：宿主若整步重放 `stream()`，握手失败会
     * 重复 spawn、认证超时会重复弹登录、prompt 超时会重放全部历史与工具调用。详见
     * 文件里「关于失败重试」的说明。
     *
     * 注意返回 `undefined` 会让宿主装上自己的默认政策；它对本 provider 不生效的
     * 前提（我们只抛 `AGY_` 前缀码）由测试锁住，不是靠这里的注释维持。
     */
    providerRetryPolicy(_provider: string): undefined;
    /**
     * 精确模型解析。按 dsh-llm 的目录语义，目录成员资格是**建议性**的
     * （catalog membership remains advisory），因此这里不因未登记的 id 报错；
     * 真正的能力拒绝发生在 ACP 会话侧（模型不存在时 agent 自行报错）。
     */
    resolveModel(provider: string, model: string, signal?: AbortSignal): Promise<LlmResolvedModelInfo>;
    /** 池已选定 worker 后，为该连接协商图片能力；不建会话、不发送 prompt。 */
    prepareImages(signal?: AbortSignal): Promise<void>;
    prepareCall(provider: string, model: string, signal?: AbortSignal): Promise<PreparedAdapterCall>;
    /**
     * 一次模型调用的 chunk 流。
     *
     * 判定「续轮 vs 新轮」：messages 尾部的连续 tool 结果消息与当前回合 park
     * 的 MCP 调用**按顺序一一匹配**且该回合的 ACP prompt 尚未应答 → 续轮；
     * 否则按新轮重建（放弃旧回合、新建 ACP session、重放完整 messages）。
     * 并发防御：主对话与标题/压缩请求可以同时进入同一个 adapter；从首个 await
     * 之前串行化 stream。工具 park 保留回合所有权，辅助请求等待而不是抢占主回合。
     */
    stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
    /**
     * 观察一次 ACP 会话配置：刷新模型目录缓存与 model 选择器。
     * `session/new`、`session/set_config_option` 与 `config_option_update` 共用。
     */
    observeSessionConfigOptions(configOptions: readonly SessionConfigOption[] | null | undefined): void;
    /** 是否已经从真实 ACP 会话观测到过配置（listModels 空目录时的诊断依据）。 */
    get catalogObserved(): boolean;
}
