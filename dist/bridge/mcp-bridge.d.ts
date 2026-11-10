import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { McpServer as AcpMcpServer } from '@agentclientprotocol/sdk';
import type { ToolSchema } from '@deepseek-ai/dsh-llm';
/** 本模块原创错误码（AGY_BRIDGE_*）。 */
export declare const AGY_BRIDGE_ERROR: {
    /** 桥尚未 start/attach 就被要求提供 MCP 注册信息。 */
    readonly NOT_LISTENING: "AGY_BRIDGE_NOT_LISTENING";
    /** HTTP 请求缺少或不匹配本桥的随机 token。 */
    readonly UNAUTHORIZED: "AGY_BRIDGE_UNAUTHORIZED";
    /** tools/call 指向桥当前未发布的工具。 */
    readonly UNKNOWN_TOOL: "AGY_BRIDGE_UNKNOWN_TOOL";
    /** 桥已关闭后再交付 tool result。 */
    readonly CLOSED: "AGY_BRIDGE_CLOSED";
    /** 请求携带的 mcp-session-id 不属于本桥的任何现存会话。 */
    readonly UNKNOWN_SESSION: "AGY_BRIDGE_UNKNOWN_SESSION";
    /** 桥已绑定一条 transport 后再次 attach。 */
    readonly ALREADY_ATTACHED: "AGY_BRIDGE_ALREADY_ATTACHED";
    /** tools/call 缺少 schema 声明的必填参数；不入 park，立即把可操作的错误还给模型。 */
    readonly INVALID_ARGUMENTS: "AGY_BRIDGE_INVALID_ARGUMENTS";
};
/** 桥为 agent 暴露的 MCP server 名称（ACP 侧注册名）。 */
export declare const BRIDGE_MCP_SERVER_NAME = "dsh-tools";
/** 注册时使用的鉴权请求头名；值为 `Bearer <token>`。 */
export declare const BRIDGE_AUTH_HEADER = "authorization";
/** MCP Streamable HTTP 规范的会话头名（客户端 initialize 之后必须回带）。 */
export declare const BRIDGE_SESSION_HEADER = "mcp-session-id";
/**
 * 常数时间比较 Bearer 头与桥 token。
 *
 * 桥绑定 loopback、token 为 32 字节随机值，普通字符串比较的实际风险极低；
 * 这里仍用 `timingSafeEqual` 作为纵深防御，代价是一次 Buffer 分配。
 * 长度不同直接返回 false（`timingSafeEqual` 对不等长会抛错），长度差异本身
 * 不构成可利用信息——token 长度是固定且公开的。
 */
export declare function matchesBridgeToken(header: string | string[] | undefined, token: string): boolean;
/** 一次被 park 的 `tools/call`。 */
export interface BridgeParkedCall {
    /** MCP 层生成的请求 id；DSH 侧以它作为 tool-call id 回喂。 */
    callId: string;
    /** MCP 工具名。 */
    name: string;
    /** 原始参数对象的 JSON 文本（DSH tool-call block 需要 raw JSON string）。 */
    arguments: string;
}
/** 一次回喂给被 park 调用的结果。 */
export interface BridgeToolResult {
    /** 与 `BridgeParkedCall.callId` 对应。 */
    callId: string;
    /** 结果文本（MCP text content）。 */
    text: string;
    /** Native image and text blocks, prepared through the host attachment service. */
    content?: CallToolResult['content'];
    /** 工具是否失败（映射到 MCP `isError`，且让 agent 自行决定重试/放弃）。 */
    isError: boolean;
}
export interface McpToolBridgeOptions {
    /** 固定监听端口；缺省为 0（由内核随机分配）。 */
    port?: number;
    /** 固定 token（仅测试用）；缺省随机 32 字节 hex。 */
    token?: string;
    /** 只包含目录工具名与固定别名，不记录参数值。 */
    onArgumentsNormalized?(tool: string, renamed: Array<{
        from: string;
        to: string;
    }>): void;
}
/**
 * 进程内 MCP 工具桥。一个 adapter 实例持有一个桥，跨 ACP 回合与 ACP 会话复用；
 * 每回合通过 `publishTools` 更新工具列表、`resetPending` 清空未回喂的 park。
 * 工具集合按**请求时**读取，因此所有 MCP 会话看到同一份当前工具。
 */
export declare class McpToolBridge {
    #private;
    constructor(options?: McpToolBridgeOptions);
    /** 本桥的随机访问 token（注册进 ACP mcpServers 的 header 值即 `Bearer ${token}`）。 */
    get token(): string;
    /** 桥的实际 MCP 端点；未 listen 时为 undefined。 */
    get url(): string | undefined;
    /** 是否已向 MCP Transport 绑定（listen 或 attach 完成）。 */
    get listening(): boolean;
    /** HTTP 监听器的最近一次运行期错误；健康时为 undefined。 */
    get lastHttpError(): Error | undefined;
    /** 订阅 park 事件；返回退订函数。 */
    onParked(listener: (call: BridgeParkedCall) => void): () => void;
    /** 发布本回合 DSH 交给 agent 的工具（tools/list 的数据源）。 */
    publishTools(tools: readonly ToolSchema[]): void;
    /** 当前桥授权代次归属的会话 key（未接管时为 undefined）。 */
    get owner(): string | undefined;
    /**
     * 新 ACP 回合取得独立授权代次，旧连接不能把调用投递到新回合。
     *
     * `owner` 记录这次代次属于哪个 DSH 对话：桥被另一个对话接管后，前一个
     * 对话的 ACP 会话不能再复用（它的 MCP 连接持有旧 token）。
     */
    beginRound(tools: readonly ToolSchema[], owner?: string): void;
    /** 撤销本回合目录、凭证和所有未完成调用；server 本身仍可用于下个回合。 */
    invalidateRound(reason: string): void;
    /** 当前发布的工具名集合。 */
    toolNames(): readonly string[];
    /** 当前目录的只读快照，供权限请求转交 DSH 时匹配工具 schema。 */
    toolSchemas(): readonly ToolSchema[];
    /** ACP `session/new` 用的 mcpServers 条目；仅 127.0.0.1 loopback。 */
    acpRegistration(): AcpMcpServer[];
    /** 尚未回喂的 park 调用 id（按 park 顺序）。 */
    pendingCallIds(): string[];
    /** 某个 tool-call id 是否仍在等待回喂。 */
    hasPending(callId: string): boolean;
    /**
     * 回喂 tool result：按 callId resolve 对应的 MCP tools/call 响应。
     * 未登记的 callId 抛错（调用方负责在投递前做匹配判断）。
     */
    deliverResults(results: readonly BridgeToolResult[]): Promise<void>;
    /**
     * 丢弃所有未回喂的 park：以错误结果 settle，使仍在等待的 MCP 客户端
     * 请求立即失败而不是永久挂起（agent 侧会看到工具调用失败）。
     */
    resetPending(reason: string): void;
    /** 绑定到任意 MCP Transport（测试用 in-memory pair；生产用 listen）。 */
    attach(transport: Transport): Promise<void>;
    /** 在 127.0.0.1 上监听随机端口的 Streamable HTTP MCP server。 */
    start(): Promise<void>;
    /** 关闭 HTTP 监听、拒绝所有未回喂 park、关闭全部会话通道。幂等。 */
    close(): Promise<void>;
}
