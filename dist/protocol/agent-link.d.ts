import type { AnyRequest, AuthMethodId, AuthenticateResponse, Implementation, InitializeRequest, InitializeResponse, LoadSessionRequest, LoadSessionResponse, NewSessionRequest, NewSessionResponse, PromptRequest, PromptResponse, RequestPermissionRequest, RequestPermissionResponse, SessionNotification, SetSessionConfigOptionRequest, SetSessionConfigOptionResponse, Stream } from '@agentclientprotocol/sdk';
import type { SubprocessHandle, SubprocessRuntime } from '@deepseek-ai/dsh-subprocess';
import type { ProxySettings } from '../runtime/proxy-env.js';
/** 本包原创协议层错误码（AGY_* 前缀命名体系）。 */
export declare const AGY_LINK_ERROR: {
    /** 子进程启动失败或 stdio 形状不符合预期。 */
    readonly LAUNCH_FAILED: "AGY_LAUNCH_FAILED";
    /** initialize 握手超时。 */
    readonly HANDSHAKE_TIMEOUT: "AGY_HANDSHAKE_TIMEOUT";
    /** 普通请求等待响应超时。 */
    readonly REQUEST_TIMEOUT: "AGY_REQUEST_TIMEOUT";
    /** authenticate 等待人工授权超时（与普通请求超时区分，便于诊断与重试策略）。 */
    readonly AUTH_TIMEOUT: "AGY_AUTH_TIMEOUT";
    /** 链接已关闭后再发起请求，或链接对端断开。 */
    readonly LINK_CLOSED: "AGY_LINK_CLOSED";
    /**
     * 收到无法路由/结构非法的消息。
     *
     * 单帧畸形只丢弃并通过 `onProtocolViolation` 留痕，不再以此码关闭链路；
     * 保留该码供诊断与既有调用方识别语义。
     */
    readonly PROTOCOL_VIOLATION: "AGY_PROTOCOL_VIOLATION";
    /** 对端以 JSON-RPC error 显式拒绝。 */
    readonly AGENT_REFUSED: "AGY_AGENT_REFUSED";
    /** 未完成 initialize 就调用会话方法。 */
    readonly NOT_INITIALIZED: "AGY_NOT_INITIALIZED";
    readonly INCOMPATIBLE_PROTOCOL: "AGY_INCOMPATIBLE_PROTOCOL";
    readonly UNSUPPORTED_CAPABILITY: "AGY_UNSUPPORTED_CAPABILITY";
};
export declare class AgentLinkError extends Error {
    /** AGY_* 机器错误码。 */
    readonly code: string;
    /** 对端返回的 JSON-RPC 错误细节（AGY_AGENT_REFUSED 时存在）。 */
    readonly jsonRpc?: {
        code: number;
        message: string;
        data?: unknown;
    };
    constructor(code: string, message: string, options?: {
        cause?: unknown;
        jsonRpc?: {
            code: number;
            message: string;
            data?: unknown;
        };
    });
}
export interface AgentLinkHandlers {
    /**
     * `session/update` 通知回调（流式 chunk、工具调用、计划等）。
     * worker2 将在此挂点上把 ACP 更新映射为 DSH StreamChunk。
     */
    onSessionUpdate?(notification: SessionNotification): void | Promise<void>;
    /**
     * `session/request_permission` 入站请求处理（agent 请用户授权工具调用）。
     * 返回值作为响应发回 agent。
     */
    onRequestPermission?(request: RequestPermissionRequest): Promise<RequestPermissionResponse> | RequestPermissionResponse;
    /**
     * worker2 补丁：其余 agent→client 方法（`fs/*`、`terminal/*`、
     * `session/create_elicitation` 等，即 clientCapabilities 未声明支持的原生
     * 能力）的入站观测点。既有控制流不变——没有注册该回调时，仍按原样回
     * method-not-found；注册后先回调再照旧回错误响应，便于上层在同一次交互里
     * 记录「非预期原生活动」并终止回合。
     */
    onUnexpectedAgentRequest?(method: string, request: AnyRequest): void | Promise<void>;
    /**
     * 收到无法路由的 JSON-RPC 消息（对端 bug 或版本漂移）。
     *
     * 该帧被丢弃，链路与在途请求都不受影响；回调只用于留痕。
     */
    onProtocolViolation?(detail: string): void;
}
export interface AgentLinkOptions {
    /** 已连接的 JSON-RPC 双向流（可来自子进程 stdio 或测试 fake）。 */
    stream: Stream;
    /** initialize 时上报的客户端信息。 */
    clientInfo?: Implementation;
    /** 单请求默认超时（毫秒）。 */
    requestTimeoutMs?: number;
    /** initialize 握手专用超时（毫秒）。 */
    handshakeTimeoutMs?: number;
    /**
     * authenticate 专用超时（毫秒）。官方 personal OAuth 认证需要人工在浏览器里
     * 完成授权，普通请求超时（默认 30s）会把正常登录直接判死，因此单列一档。
     */
    authTimeoutMs?: number;
    handlers?: AgentLinkHandlers;
    /** 关闭仅等待有界时间；进程回收仍由宿主负责。 */
    closeTimeoutMs?: number;
}
export interface AgentLinkRequestOptions {
    timeoutMs?: number;
    signal?: AbortSignal;
}
/** 官方 personal OAuth 认证方法 id（ACP v1 规范约定的固定值）。 */
export declare const OAUTH_PERSONAL_AUTH_METHOD: AuthMethodId;
/** 官方 client 实现信息（initialize 上报）。 */
export declare const AGY_CLIENT_INFO: Implementation;
/**
 * ACP v1 客户端链接。生命周期：new AgentLink({ stream }) → start() →
 * initialize() → authenticate() → 会话方法 … → close()。
 */
export declare class AgentLink {
    #private;
    constructor(options: AgentLinkOptions);
    /** 链路是否已关闭（主动 close 或对端断流会置位）；已关闭的链路不可复用。 */
    get closed(): boolean;
    /** 是否已完成 initialize。 */
    get initialized(): boolean;
    /** 最近一次 session/new 保存的会话 id；未创建时为 undefined。 */
    get sessionId(): string | undefined;
    /**
     * worker2 补丁：保存的 initialize 响应。目录/能力观察需要读到协议版本与
     * agentCapabilities，且不得为此重发一次 initialize。
     */
    get initializeResponse(): InitializeResponse | undefined;
    /** 启动入站消息泵。重复调用无副作用。 */
    start(): void;
    /** 发出一次请求并等待关联响应；超时同时发出协作式取消通知。 */
    request<Response = unknown>(method: string, params: unknown, options?: AgentLinkRequestOptions): Promise<Response>;
    /** 发出一条通知（无 id、无响应）。 */
    notify(method: string, params: unknown): Promise<void>;
    /**
     * 握手：initialize。请求携带协议版本与客户端信息；握手专用超时触发
     * AGY_HANDSHAKE_TIMEOUT（区别于普通请求超时码）。
     */
    initialize(params?: Partial<InitializeRequest>): Promise<InitializeResponse>;
    /**
     * 认证；默认官方 personal OAuth 方法。
     *
     * 走**独立的** `authTimeoutMs`（默认 5 分钟）：该流程要人工在浏览器里完成
     * 授权，用普通请求的 30s 超时会在用户还没点完就判死。
     *
     * 超时被改写成 `AGY_AUTH_TIMEOUT` 而不是通用的 `AGY_REQUEST_TIMEOUT`：认证超时
     * 之后重放请求等于重新 spawn 一次官方进程并重新弹一次登录，**不可重试**，必须
     * 与普通请求超时在错误码上分开。
     */
    authenticate(methodId?: AuthMethodId): Promise<AuthenticateResponse>;
    /** 创建会话并保存会话 id。 */
    newSession(request: NewSessionRequest, options?: AgentLinkRequestOptions): Promise<NewSessionResponse>;
    /** 设置会话配置选项（configId/value 形状按 ACP v1 schema）。 */
    setConfigOption(params: SetSessionConfigOptionRequest, options?: AgentLinkRequestOptions): Promise<SetSessionConfigOptionResponse>;
    /**
     * 加载已有会话以恢复上一次对话（仅当 agent 声明 `loadSession` 时可用）。
     *
     * 注意：按 ACP 规范，agent 会把**整段历史**通过 `session/update` 重放回来；
     * 调用方必须在这段时间抑制通知处理，否则回放内容会被当成新一轮输出。
     * `LoadSessionResponse` 不含 sessionId，恢复后沿用请求里的 id。
     */
    loadSession(request: LoadSessionRequest, options?: AgentLinkRequestOptions): Promise<LoadSessionResponse>;
    /** 关闭一个会话，释放 agent 侧状态；失败原样抛给调用方决定是否忽略。 */
    closeSession(sessionId?: string, options?: AgentLinkRequestOptions): Promise<void>;
    /** 发送一轮用户 prompt；响应只含 stopReason，流式内容走 session/update。 */
    prompt(params: PromptRequest, options?: AgentLinkRequestOptions): Promise<PromptResponse>;
    /** 请求-响应版的权限询问（客户端代用户作答时使用）。 */
    requestPermission(params: RequestPermissionRequest, options?: AgentLinkRequestOptions): Promise<RequestPermissionResponse>;
    /** 取消会话当前回合（通知，无响应）。 */
    cancel(sessionId?: string): Promise<void>;
    /**
     * 关闭链接：拒绝所有在途请求、关闭出站流、等待入站泵结束。幂等。
     */
    close(): Promise<void>;
}
/** 把由 ctx.subprocess 启动的子进程 stdio 包装成 ACP JSON-RPC 双向流。 */
export declare function agentStreamFromSubprocess(handle: SubprocessHandle): Stream;
/**
 * PyInstaller 冻结的官方 exe 需要可写 TEMP。DSH subprocess 会 scrub 父环境，
 * 只显式传入的键会保留；若不转发 TMP/TEMP，bootloader 报
 * `[PYI-…:ERROR] Could not create temporary directory!` 后立刻退出。
 */
export declare function officialAgentEnv(options: {
    binaryDir: string;
    tmpDir: string;
    /** 出网代理；留空则不注入任何代理变量（官方进程直连）。 */
    proxy?: ProxySettings | undefined;
    parent?: NodeJS.ProcessEnv;
}): NodeJS.ProcessEnv;
/** 经 ctx.subprocess 启动官方 ACP server（本文件不触碰 child_process）。 */
export declare function launchAcpAgent(subprocess: SubprocessRuntime, options: {
    executable: string;
    extraArgs?: readonly string[];
    cwd?: string;
    tmpDir: string;
    proxy?: ProxySettings | undefined;
    signal?: AbortSignal;
}): SubprocessHandle;
