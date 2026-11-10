import type { StreamChunk, TokenUsage } from '@deepseek-ai/dsh-llm';
import type { ContentBlock, PromptResponse, RequestPermissionRequest, RequestPermissionResponse, SessionConfigOption, SessionNotification, Usage } from '@agentclientprotocol/sdk';
import type { AgentLink } from '../protocol/agent-link.js';
import type { BridgeParkedCall, BridgeToolResult, McpToolBridge } from '../bridge/mcp-bridge.js';
import type { PermissionDiagnostic } from './permission-diagnostic.js';
/** 本文件使用的原创错误码（AGY_* 体系，与 agent-link / mcp-bridge 同族）。 */
export declare const AGY_TURN_ERROR: {
    /** ACP 工具权限请求被拒，不能据此判断请求一定是原生能力。 */
    readonly PERMISSION_DENIED: "AGY_PERMISSION_DENIED";
    /** agent 发起了 clientCapabilities 已关闭的原生能力请求（fs/terminal/…）。 */
    readonly NATIVE_ACTIVITY_REFUSED: "AGY_NATIVE_ACTIVITY_REFUSED";
    /** 调用方 abort 导致的回合终止。 */
    readonly ABORTED: "AGY_ABORTED";
    /** agent 以 refusal 结束本轮。 */
    readonly REFUSED: "AGY_AGENT_REFUSED";
    /** 本回合没有等待回喂的 park 调用，却收到了续轮回喂请求。 */
    readonly NO_PENDING_TOOL_CALL: "AGY_NO_PENDING_TOOL_CALL";
    /** 官方宣告 end_turn，但没有可见文本/工具调用；不能冒充成功。 */
    readonly EMPTY_RESPONSE: "AGY_EMPTY_RESPONSE";
};
/** 未分类的意外状态（link 关闭、agent 异常取消等）在此码下归一。 */
export declare const AGY_TURN_UNEXPECTED = "AGY_UNEXPECTED";
/** ACP prompt 的 content 形状（与 SDK `PromptRequest.prompt` 对齐）。 */
export type PromptContent = ContentBlock[];
export interface PromptTurnOptions {
    /** 已握手已认证的 ACP 链接。 */
    link: AgentLink;
    /** 本回合使用的 MCP 工具桥。 */
    bridge: McpToolBridge;
    /** session/prompt 的等待上限（毫秒）。 */
    promptTimeoutMs: number;
    /** 并发 park 的聚合窗口（毫秒）。 */
    parkSettleMs: number;
    /** config_option_update 的观察者（用于刷新模型目录）。 */
    onConfigOptions?(options: readonly SessionConfigOption[]): void;
    /**
     * 未自然结束的回合失败/取消：由 adapter 回收受管运行时，不依赖对端实现取消。
     * `info.clean === true` 表示 prompt 已**正常应答**的干净失败（refusal / 空回复 /
     * 未知 stopReason）：agent 状态自洽，调用方可以复用链接而不必回收。
     */
    onTerminate(reason: string, info?: {
        clean?: boolean;
        aborted?: boolean;
    }): void;
    /** prompt 已应答（含取消应答）时回调；adapter 用它确认「取消是否真的生效」。 */
    onPromptSettled?(turn: PromptTurn, response?: PromptResponse): void;
    /** 尚未终止回合的一次拒绝；permission 不等于原生 fs/terminal，不能据此做身份判断。 */
    onNativeRefusal?(info: {
        kind: 'permission' | 'request';
        detail: string;
        count: number;
    }): void;
    /** 固定词表的权限结构摘要；仅诊断，不作为放行依据。 */
    onPermissionDiagnostic?(diagnostic: PermissionDiagnostic): void;
    /** 仅允许私有 MCP 请求进入桥；不代表 DSH 已批准执行。 */
    onBridgePermission?(tool: string): void;
    /**
     * MCP 权限提示中的参数与目录 schema 不符（缺必填 / 出现未声明键）。仅诊断：
     * 实际入桥时再修正别名与预检，DSH 负责最终校验；这里只含可安全回显的键名。
     */
    onArgumentIssues?(info: {
        tool: string;
        missing: string[];
        unknown: string[];
        unknownCount: number;
    }): void;
}
export declare class PromptTurn {
    #private;
    /** ACP 会话 id。 */
    readonly sessionId: string;
    constructor(sessionId: string, options: PromptTurnOptions);
    /** 本回合的 ACP prompt 是否已有应答；应答后无法再「在同一 prompt 内续轮」。 */
    get promptSettled(): boolean;
    get promptStarted(): boolean;
    /** 本地已终止，不再允许续接；对端回收由 adapter 的屏障保证。 */
    get terminated(): boolean;
    /** 本回合已交给 DSH 的工具调用（迟到调用在 resume 后才加入）。 */
    get parkedCalls(): readonly BridgeParkedCall[];
    /** 本回合是否停在「等待 DSH 回喂工具结果」的续轮状态。 */
    get awaitingToolResults(): boolean;
    /** 把 session/update 交给当前回合（由 adapter 的稳定 handler 转发）。 */
    handleSessionUpdate(notification: SessionNotification): void;
    /**
     * 仅私有 MCP 路由选择 allow_once，让实际 tools/call 在桥上 park；
     * 不从权限提示合成第二次工具执行，不在这里封口或回收进程。
     * 前提是 session/new 已移除 AGY 内置工具，且客户端 fs/terminal 已关闭。
     * eager 工具按官方固定标题匹配目录；allow_always 从不选择。
     */
    handleRequestPermission(request: RequestPermissionRequest): RequestPermissionResponse;
    /**
     * clientCapabilities 已全部关闭，因此这里出现的任何 agent→client 请求都是非预期的。
     * 与权限询问同样处理：响应照旧由 AgentLink 回 method-not-found，本回合先继续。
     */
    handleUnexpectedAgentRequest(method: string): void;
    /**
     * 启动 session/prompt 并驱动回合收尾（不阻塞调用方）。
     * 调用时信号已 aborted 的请求根本不发出 prompt：无人应答的回合没有价值，
     * 也不该在 ACP 侧留下一次无人接收的 prompt。
     */
    startPrompt(content: PromptContent, signal?: AbortSignal): void;
    /** 收到 abort 信号：取消 ACP 会话当前回合并以 aborted 结束。 */
    abort(reason: string): void;
    /** 桥 park 了新调用：进入当前回合。 */
    handleParked(call: BridgeParkedCall): void;
    /**
     * 续轮复位：上一轮以 finish(tool-calls) 封口后，生产者已停摆。续轮要继续
     * 在**同一个 ACP prompt** 内接收后续 session/update，因此重新打开队列与
     * 回合边界，并（若给了 signal）重新挂上 abort 监听。
     *
     * 上一轮已产出的 chunk（含 finish）不会重放——续轮只交付新内容。
     */
    resume(signal?: AbortSignal): void;
    /** 续轮回喂：把 DSH 的 tool result 交给桥 resolve 对应的 MCP 调用。 */
    deliverToolResults(results: readonly BridgeToolResult[]): Promise<void>;
    /** 消费者侧：取下一个 chunk；undefined 表示本轮（含 finish）已取尽。 */
    nextChunk(): Promise<StreamChunk | undefined>;
    /** 等待 ACP prompt 应答（测试与诊断使用）。 */
    settled(): Promise<void>;
    /** 释放定时器与 abort 监听（回合结束或回合被放弃时调用）。 */
    dispose(): void;
    /**
     * 结束本回合并向队列封口：先 usage 后 finish；finish 入队后生产者停止，
     * 因此消费者不会看到 finish 之后的任何 chunk。幂等。
     */
    finishRound(usage?: TokenUsage): void;
    /** 关闭当前打开中的 text/reasoning block（幂等）。 */
    closeOpenBlock(): void;
}
/**
 * ACP Usage → DSH TokenUsage。
 *
 * 协议把 `PromptResponse.usage` 标为「本轮用量」（UNSTABLE），但官方
 * agy_acp_server 1.4.0 实测不返回该字段，因此本 adapter 通常不上报 usage；
 * 返回时按原值上报，不做任何估算或累计换算。
 */
export declare function mapUsage(usage: Usage | null | undefined): TokenUsage | undefined;
