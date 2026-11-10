/**
 * ACP v1 stdio 客户端链接层（原创实现）。
 *
 * 以官方 `@agentclientprotocol/sdk` 的 transport 原语（`ndJsonStream`、
 * `Stream`、JSON-RPC 消息类型与 schema 类型）为基础，自写客户端侧的
 * 请求多路复用、超时/取消、通知分发与协议方法封装。SDK 1.4.0 的高层
 * `ClientApp` 面向一次性 `connectWith` 工作流，不适合长生命周期 adapter，
 * 因此不复用其连接编排，仅用其帧协议原语与类型。
 *
 * 进程启动不在此文件内触碰 child_process：stdio 通道由调用方注入
 * （生产路径经宿主注入的 ctx.subprocess，测试路径注入 fake 双向流）。
 */
import { readFileSync } from 'node:fs';
import { dirname, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Writable, Readable } from 'node:stream';
import { PROTOCOL_VERSION, ndJsonStream } from '@agentclientprotocol/sdk';
import { ambientProxyEnv, buildProxyEnv } from '../runtime/proxy-env.js';
/** 本包原创协议层错误码（AGY_* 前缀命名体系）。 */
export const AGY_LINK_ERROR = {
    /** 子进程启动失败或 stdio 形状不符合预期。 */
    LAUNCH_FAILED: 'AGY_LAUNCH_FAILED',
    /** initialize 握手超时。 */
    HANDSHAKE_TIMEOUT: 'AGY_HANDSHAKE_TIMEOUT',
    /** 普通请求等待响应超时。 */
    REQUEST_TIMEOUT: 'AGY_REQUEST_TIMEOUT',
    /** authenticate 等待人工授权超时（与普通请求超时区分，便于诊断与重试策略）。 */
    AUTH_TIMEOUT: 'AGY_AUTH_TIMEOUT',
    /** 链接已关闭后再发起请求，或链接对端断开。 */
    LINK_CLOSED: 'AGY_LINK_CLOSED',
    /**
     * 收到无法路由/结构非法的消息。
     *
     * 单帧畸形只丢弃并通过 `onProtocolViolation` 留痕，不再以此码关闭链路；
     * 保留该码供诊断与既有调用方识别语义。
     */
    PROTOCOL_VIOLATION: 'AGY_PROTOCOL_VIOLATION',
    /** 对端以 JSON-RPC error 显式拒绝。 */
    AGENT_REFUSED: 'AGY_AGENT_REFUSED',
    /** 未完成 initialize 就调用会话方法。 */
    NOT_INITIALIZED: 'AGY_NOT_INITIALIZED',
    INCOMPATIBLE_PROTOCOL: 'AGY_INCOMPATIBLE_PROTOCOL',
    UNSUPPORTED_CAPABILITY: 'AGY_UNSUPPORTED_CAPABILITY',
};
export class AgentLinkError extends Error {
    /** AGY_* 机器错误码。 */
    code;
    /** 对端返回的 JSON-RPC 错误细节（AGY_AGENT_REFUSED 时存在）。 */
    jsonRpc;
    constructor(code, message, options) {
        super(message, options);
        this.name = 'AgentLinkError';
        this.code = code;
        this.jsonRpc = options?.jsonRpc;
    }
}
/** 官方 personal OAuth 认证方法 id（ACP v1 规范约定的固定值）。 */
export const OAUTH_PERSONAL_AUTH_METHOD = 'oauth-personal';
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_HANDSHAKE_TIMEOUT_MS = 15_000;
/** 认证默认上限：人工点浏览器授权的时间尺度，与普通请求超时分开。 */
const DEFAULT_AUTH_TIMEOUT_MS = 5 * 60_000;
/**
 * 畸形帧的诊断预览：只用于定位，不进入模型上下文。
 *
 * 截断长度并压成单行，避免把一条超大/多行的坏消息整段写进日志。
 * 环形引用等序列化异常也在这里兜住。
 */
function safeMessagePreview(message) {
    try {
        return JSON.stringify(message).slice(0, 200);
    }
    catch {
        return '<无法序列化的消息>';
    }
}
/** 官方 client 实现信息（initialize 上报）。 */
export const AGY_CLIENT_INFO = { name: 'dsh-bundle-antigravity-host', version: readPackageVersion() };
/** 读本包 package.json 的版本（src 与 dist 到它的相对路径一致）；读不到不影响启动。 */
function readPackageVersion() {
    try {
        const file = fileURLToPath(new URL('../../package.json', import.meta.url));
        const version = JSON.parse(readFileSync(file, 'utf8')).version;
        return typeof version === 'string' && version.length > 0 ? version : '0.0.0';
    }
    catch {
        return '0.0.0';
    }
}
/**
 * ACP v1 客户端链接。生命周期：new AgentLink({ stream }) → start() →
 * initialize() → authenticate() → 会话方法 … → close()。
 */
export class AgentLink {
    #stream;
    #clientInfo;
    #requestTimeoutMs;
    #handshakeTimeoutMs;
    #authTimeoutMs;
    #handlers;
    #closeTimeoutMs;
    /** 无法路由的畸形帧只留痕并丢弃，不据此关闭链路（见 #route）。 */
    #onProtocolViolation;
    #closePromise;
    #pending = new Map();
    #nextId = 1;
    #closed = false;
    #pumpPromise;
    #initialized = false;
    #initializeResponse;
    #boundSessionId;
    /** 出站单例 writer：并发 #write 复用同一个 writer，避免重复 getWriter 撞锁。 */
    #writer;
    /** 入站单例 reader；close 时 cancel，保证 pump 可结束、close 可完成。 */
    #reader;
    constructor(options) {
        this.#stream = options.stream;
        this.#clientInfo = options.clientInfo;
        this.#requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
        this.#handshakeTimeoutMs = options.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS;
        this.#authTimeoutMs = options.authTimeoutMs ?? DEFAULT_AUTH_TIMEOUT_MS;
        this.#handlers = options.handlers ?? {};
        this.#closeTimeoutMs = options.closeTimeoutMs ?? 250;
        this.#onProtocolViolation = options.handlers?.onProtocolViolation;
    }
    /** 链路是否已关闭（主动 close 或对端断流会置位）；已关闭的链路不可复用。 */
    get closed() {
        return this.#closed;
    }
    /** 是否已完成 initialize。 */
    get initialized() {
        return this.#initialized;
    }
    /** 最近一次 session/new 保存的会话 id；未创建时为 undefined。 */
    get sessionId() {
        return this.#boundSessionId;
    }
    /**
     * worker2 补丁：保存的 initialize 响应。目录/能力观察需要读到协议版本与
     * agentCapabilities，且不得为此重发一次 initialize。
     */
    get initializeResponse() {
        return this.#initializeResponse;
    }
    /** 启动入站消息泵。重复调用无副作用。 */
    start() {
        this.#pumpPromise ??= this.#pump();
    }
    async #pump() {
        const reader = this.#stream.readable.getReader();
        this.#reader = reader;
        try {
            for (;;) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                this.#route(value);
            }
        }
        catch (error) {
            this.#rejectAllPending(new AgentLinkError(AGY_LINK_ERROR.LINK_CLOSED, 'ACP 流读取失败，链接关闭', { cause: error }));
        }
        finally {
            reader.releaseLock();
            this.#closed = true;
            this.#rejectAllPending(new AgentLinkError(AGY_LINK_ERROR.LINK_CLOSED, 'ACP 链路已关闭'));
        }
    }
    #route(message) {
        if ('method' in message) {
            if ('id' in message && message.id !== undefined) {
                void this.#routeInboundRequest(message);
            }
            else {
                this.#routeNotification(message);
            }
            return;
        }
        if ('id' in message && ('result' in message || 'error' in message)) {
            this.#routeResponse(message);
            return;
        }
        // 带 id 却没有 result/error：这是「形状非法的响应」，而不是无关垃圾帧。
        // 命中在途请求时必须立即按协议违规拒绝它——丢弃会让那个请求白等到
        // requestTimeoutMs（默认 30s）才报超时。
        // 上面两个分支已把 AnyMessage 的联合类型窄到 never，这里按原始形状取值。
        // 带 method 的帧上面已归入请求/通知，所以到这里必然没有 method；此时若还带着
        // 我方 pending id，只可能是在回应那个请求（只是形状坏了）。不必再验证其它响应
        // 侧字段——那会漏掉「只有 id」这种最常见的畸形形态。
        const malformedId = message.id;
        if (malformedId !== undefined && malformedId !== null) {
            const entry = this.#pending.get(malformedId);
            if (entry) {
                this.#pending.delete(malformedId);
                clearTimeout(entry.timer);
                entry.reject(new AgentLinkError(AGY_LINK_ERROR.PROTOCOL_VIOLATION, `ACP 响应缺少 result/error (${entry.method}): ${safeMessagePreview(message)}`));
                return;
            }
        }
        // 单条畸形消息不足以判定整条链路失效：抛错会沿 #pump 关闭链路并让所有在途
        // 请求以 LINK_CLOSED 失败。这里只记录（截断、不含正文之外的材料）并丢弃这一帧，
        // 真正的断流仍由 `reader.read()` 的 done/异常路径处理。
        // 回调属于上层（adapter）逻辑，与 #routeNotification 一样必须隔离：它抛错会
        // 沿 #pump 重新把整条链路判死，正好抵消这条修复。
        try {
            this.#onProtocolViolation?.(`无法路由的 JSON-RPC 消息: ${safeMessagePreview(message)}`);
        }
        catch {
            // 留痕失败不影响丢弃该帧。
        }
    }
    async #routeInboundRequest(request) {
        if (request.method === 'session/request_permission') {
            const handler = this.#handlers.onRequestPermission;
            if (!handler) {
                await this.#write({
                    jsonrpc: '2.0',
                    id: request.id,
                    error: { code: -32601, message: `本客户端未注册 session/request_permission 处理器（${AGY_LINK_ERROR.NOT_INITIALIZED}）` },
                }).catch(() => undefined);
                return;
            }
            try {
                const outcome = await handler(request.params);
                await this.#write({ jsonrpc: '2.0', id: request.id, result: outcome });
            }
            catch (cause) {
                await this.#write({
                    jsonrpc: '2.0',
                    id: request.id,
                    error: { code: -32000, message: cause instanceof Error ? cause.message : String(cause) },
                }).catch(() => undefined);
            }
            return;
        }
        // 其余 agent→client 方法本阶段未实现，回标准 method-not-found。
        // 先给可选观测回调一个机会（worker2 补丁）：它只旁路记录，不改变回包。
        // 观测回调出错不能让 agent 的请求永远得不到应答，也不能变成 unhandledRejection。
        try {
            await this.#handlers.onUnexpectedAgentRequest?.(request.method, request);
        }
        catch {
            // 仅旁路观测；照旧回 method-not-found。
        }
        await this.#write({
            jsonrpc: '2.0',
            id: request.id,
            error: { code: -32601, message: `未实现的入站请求方法: ${request.method}` },
        }).catch(() => undefined);
    }
    #routeNotification(notification) {
        if (notification.method !== 'session/update')
            return;
        const handler = this.#handlers.onSessionUpdate;
        if (!handler)
            return;
        // 回调属于上层（adapter）逻辑：同步抛错会沿 #route → #pump 把整条链路判死，
        // 异步 reject 无人接会变成 unhandledRejection 终止宿主进程。两者都隔离在这里。
        try {
            const outcome = handler(notification.params);
            if (outcome)
                void Promise.resolve(outcome).catch(() => undefined);
        }
        catch {
            // 单条通知处理失败不影响后续消息与在途请求。
        }
    }
    #routeResponse(response) {
        const entry = this.#pending.get(response.id);
        if (!entry)
            return;
        this.#pending.delete(response.id);
        clearTimeout(entry.timer);
        const failure = response.error;
        if (failure) {
            entry.reject(new AgentLinkError(AGY_LINK_ERROR.AGENT_REFUSED, `ACP 请求被拒绝 (${entry.method}): ${failure.message}`, {
                jsonRpc: { code: failure.code, message: failure.message, data: failure.data },
            }));
            return;
        }
        entry.resolve(response.result);
    }
    #rejectAllPending(error) {
        for (const [, entry] of this.#pending) {
            clearTimeout(entry.timer);
            entry.reject(error);
        }
        this.#pending.clear();
    }
    async #write(message) {
        if (this.#closed) {
            throw new AgentLinkError(AGY_LINK_ERROR.LINK_CLOSED, 'ACP 链路已关闭，无法写出消息');
        }
        // 单例 writer：WritableStream 只允许一个 writer，并发写必须复用。
        this.#writer ??= this.#stream.writable.getWriter();
        await this.#writer.write(message);
    }
    /** 发出一次请求并等待关联响应；超时同时发出协作式取消通知。 */
    async request(method, params, options = {}) {
        if (this.#closed) {
            throw new AgentLinkError(AGY_LINK_ERROR.LINK_CLOSED, `ACP 链路已关闭，无法发起请求 ${method}`);
        }
        // signal 在发起前就已中止：不发请求（否则会留下一个无人关心的在途请求）。
        if (options.signal?.aborted) {
            throw new AgentLinkError(AGY_LINK_ERROR.REQUEST_TIMEOUT, `ACP 请求被中止: ${method}`, { cause: options.signal.reason });
        }
        const id = this.#nextId++;
        const timeoutMs = options.timeoutMs ?? this.#requestTimeoutMs;
        const pending = new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.#pending.delete(id);
                // 协作式取消：JSON-RPC 标准的 $/cancel_request 通知（尽力而为）。
                void this.#write({ jsonrpc: '2.0', method: '$/cancel_request', params: { requestId: id } }).catch(() => undefined);
                reject(new AgentLinkError(AGY_LINK_ERROR.REQUEST_TIMEOUT, `ACP 请求超时（${timeoutMs}ms）: ${method}`));
            }, timeoutMs);
            this.#pending.set(id, { resolve: resolve, reject, timer, method });
        });
        // 写失败路径不会 await 这个 promise：先挂一个 no-op 处理器，保证任何时序下
        // 它的 rejection 都不会变成 unhandledRejection（那会终止宿主进程）。
        // 正常路径仍用 `await pending` 取到同一 rejection，语义不变。
        void pending.catch(() => undefined);
        const abortHandler = () => {
            const entry = this.#pending.get(id);
            if (!entry)
                return;
            this.#pending.delete(id);
            clearTimeout(entry.timer);
            void this.#write({ jsonrpc: '2.0', method: '$/cancel_request', params: { requestId: id } }).catch(() => undefined);
            entry.reject(new AgentLinkError(AGY_LINK_ERROR.REQUEST_TIMEOUT, `ACP 请求被中止: ${method}`, { cause: options.signal?.reason }));
        };
        options.signal?.addEventListener('abort', abortHandler, { once: true });
        let writeCompleted = false;
        try {
            const sent = this.#write({ jsonrpc: '2.0', id, method, params }).then(() => {
                writeCompleted = true;
                return pending;
            });
            // 响应 deadline 同时覆盖管道 backpressure；不能先无限等待 write。
            return await Promise.race([sent, pending]);
        }
        catch (error) {
            // 写入是否已完整送达无法确认时，不允许复用这条连接。但「对端已经回过帧」
            // 本身就是送达证据：AGENT_REFUSED 与 PROTOCOL_VIOLATION 只可能来自收到的
            // 响应（哪怕形状非法）。不排除这两种时，一个畸形响应会在 write 尚未落定
            // 的时序下把链路误关掉，等于把这次修复又撤销了。
            const answeredByPeer = error instanceof AgentLinkError
                && (error.code === AGY_LINK_ERROR.AGENT_REFUSED || error.code === AGY_LINK_ERROR.PROTOCOL_VIOLATION);
            if (!writeCompleted && !answeredByPeer)
                void this.close();
            // 写出失败（对端断流、链路关闭）时 pending 条目没有人消费：必须当场摘除并
            // 清掉超时定时器，否则它会一直留在表里，定时器到期后写出多余的
            // $/cancel_request，并 reject 一个无人等待的 promise。
            const entry = this.#pending.get(id);
            if (entry) {
                this.#pending.delete(id);
                clearTimeout(entry.timer);
            }
            throw error;
        }
        finally {
            options.signal?.removeEventListener('abort', abortHandler);
        }
    }
    /** 发出一条通知（无 id、无响应）。 */
    async notify(method, params) {
        await this.#write({ jsonrpc: '2.0', method, params });
    }
    /**
     * 握手：initialize。请求携带协议版本与客户端信息；握手专用超时触发
     * AGY_HANDSHAKE_TIMEOUT（区别于普通请求超时码）。
     */
    async initialize(params = {}) {
        try {
            const response = await this.request('initialize', {
                protocolVersion: params.protocolVersion ?? PROTOCOL_VERSION,
                clientInfo: params.clientInfo ?? this.#clientInfo,
                ...params,
            }, { timeoutMs: this.#handshakeTimeoutMs });
            if (!response || response.protocolVersion !== PROTOCOL_VERSION) {
                void this.close();
                throw new AgentLinkError(AGY_LINK_ERROR.INCOMPATIBLE_PROTOCOL, `ACP 协议版本不兼容：客户端仅支持 ${PROTOCOL_VERSION}，服务端未返回相同版本`);
            }
            this.#initialized = true;
            this.#initializeResponse = response;
            return response;
        }
        catch (error) {
            if (error instanceof AgentLinkError && error.code === AGY_LINK_ERROR.REQUEST_TIMEOUT) {
                throw new AgentLinkError(AGY_LINK_ERROR.HANDSHAKE_TIMEOUT, `ACP initialize 握手超时（${this.#handshakeTimeoutMs}ms）`, { cause: error });
            }
            throw error;
        }
    }
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
    async authenticate(methodId = OAUTH_PERSONAL_AUTH_METHOD) {
        this.#requireInitialized('authenticate');
        try {
            return await this.request('authenticate', { methodId }, { timeoutMs: this.#authTimeoutMs });
        }
        catch (error) {
            if (error instanceof AgentLinkError && error.code === AGY_LINK_ERROR.REQUEST_TIMEOUT) {
                throw new AgentLinkError(AGY_LINK_ERROR.AUTH_TIMEOUT, `ACP authenticate 超时（${this.#authTimeoutMs}ms）：等待人工完成授权未果`, { cause: error });
            }
            throw error;
        }
    }
    /** 创建会话并保存会话 id。 */
    async newSession(request, options) {
        this.#requireInitialized('session/new');
        for (const server of request.mcpServers) {
            if ('type' in server && server.type === 'http' && this.#initializeResponse?.agentCapabilities?.mcpCapabilities?.http !== true) {
                throw new AgentLinkError(AGY_LINK_ERROR.UNSUPPORTED_CAPABILITY, 'ACP 服务端未声明 HTTP MCP 支持，无法安全接入 DSH 工具');
            }
            if ('type' in server && server.type === 'sse' && this.#initializeResponse?.agentCapabilities?.mcpCapabilities?.sse !== true) {
                throw new AgentLinkError(AGY_LINK_ERROR.UNSUPPORTED_CAPABILITY, 'ACP 服务端未声明 SSE MCP 支持');
            }
        }
        const response = await this.request('session/new', request, options);
        this.#boundSessionId = response.sessionId;
        return response;
    }
    /** 设置会话配置选项（configId/value 形状按 ACP v1 schema）。 */
    async setConfigOption(params, options) {
        this.#requireInitialized('session/set_config_option');
        return this.request('session/set_config_option', params, options);
    }
    /**
     * 加载已有会话以恢复上一次对话（仅当 agent 声明 `loadSession` 时可用）。
     *
     * 注意：按 ACP 规范，agent 会把**整段历史**通过 `session/update` 重放回来；
     * 调用方必须在这段时间抑制通知处理，否则回放内容会被当成新一轮输出。
     * `LoadSessionResponse` 不含 sessionId，恢复后沿用请求里的 id。
     */
    async loadSession(request, options) {
        this.#requireInitialized('session/load');
        if (this.#initializeResponse?.agentCapabilities?.loadSession !== true) {
            throw new AgentLinkError(AGY_LINK_ERROR.UNSUPPORTED_CAPABILITY, 'ACP 服务端未声明 loadSession，无法恢复已有会话');
        }
        const response = await this.request('session/load', request, options);
        this.#boundSessionId = request.sessionId;
        return response;
    }
    /** 关闭一个会话，释放 agent 侧状态；失败原样抛给调用方决定是否忽略。 */
    async closeSession(sessionId = this.#boundSessionId ?? '', options) {
        this.#requireInitialized('session/close');
        if (!sessionId)
            return;
        await this.request('session/close', { sessionId }, options);
        if (this.#boundSessionId === sessionId)
            this.#boundSessionId = undefined;
    }
    /** 发送一轮用户 prompt；响应只含 stopReason，流式内容走 session/update。 */
    async prompt(params, options) {
        this.#requireInitialized('session/prompt');
        const capabilities = this.#initializeResponse?.agentCapabilities?.promptCapabilities;
        for (const content of params.prompt) {
            const unsupported = content.type === 'image' ? capabilities?.image !== true
                : content.type === 'audio' ? capabilities?.audio !== true
                    : content.type === 'resource' ? capabilities?.embeddedContext !== true : false;
            if (unsupported)
                throw new AgentLinkError(AGY_LINK_ERROR.UNSUPPORTED_CAPABILITY, `ACP 服务端未声明 ${content.type} 输入支持`);
        }
        return this.request('session/prompt', params, options);
    }
    /** 请求-响应版的权限询问（客户端代用户作答时使用）。 */
    async requestPermission(params, options) {
        this.#requireInitialized('session/request_permission');
        return this.request('session/request_permission', params, options);
    }
    /** 取消会话当前回合（通知，无响应）。 */
    async cancel(sessionId = this.#boundSessionId ?? '') {
        const payload = { sessionId };
        await this.notify('session/cancel', payload);
    }
    #requireInitialized(operation) {
        if (!this.#initialized) {
            throw new AgentLinkError(AGY_LINK_ERROR.NOT_INITIALIZED, `调用 ${operation} 前必须先完成 initialize`);
        }
    }
    /**
     * 关闭链接：拒绝所有在途请求、关闭出站流、等待入站泵结束。幂等。
     */
    async close() {
        this.#closePromise ??= this.#closeBounded();
        return this.#closePromise;
    }
    async #closeBounded() {
        this.#closed = true;
        this.#rejectAllPending(new AgentLinkError(AGY_LINK_ERROR.LINK_CLOSED, 'ACP 链路已关闭'));
        const closing = Promise.allSettled([
            this.#reader?.cancel(),
            this.#writer ? this.#writer.close() : this.#stream.writable.close(),
            this.#pumpPromise,
        ]);
        let timer;
        try {
            await Promise.race([closing, new Promise((resolve) => { timer = setTimeout(resolve, this.#closeTimeoutMs); })]);
        }
        finally {
            if (timer)
                clearTimeout(timer);
        }
    }
}
/** 把由 ctx.subprocess 启动的子进程 stdio 包装成 ACP JSON-RPC 双向流。 */
export function agentStreamFromSubprocess(handle) {
    if (!handle.stdin || !handle.stdout) {
        throw new AgentLinkError(AGY_LINK_ERROR.LAUNCH_FAILED, '子进程 stdio 不完整（需要 stdin/stdout 均为 pipe），无法建立 ACP 链路');
    }
    const stdinWeb = Writable.toWeb(handle.stdin);
    const stdoutWeb = Readable.toWeb(handle.stdout);
    return ndJsonStream(stdinWeb, stdoutWeb);
}
/**
 * PyInstaller 冻结的官方 exe 需要可写 TEMP。DSH subprocess 会 scrub 父环境，
 * 只显式传入的键会保留；若不转发 TMP/TEMP，bootloader 报
 * `[PYI-…:ERROR] Could not create temporary directory!` 后立刻退出。
 */
export function officialAgentEnv(options) {
    const parent = options.parent ?? process.env;
    const pathPrefix = `${options.binaryDir}${delimiter}`;
    const parentPath = parent.PATH ?? '';
    const env = {
        PATH: parentPath.startsWith(pathPrefix) ? parentPath : `${pathPrefix}${parentPath}`,
        TEMP: options.tmpDir,
        TMP: options.tmpDir,
        TMPDIR: options.tmpDir,
    };
    const forward = [
        'USERPROFILE',
        'HOME',
        'HOMEDRIVE',
        'HOMEPATH',
        'LOCALAPPDATA',
        'APPDATA',
        'USERNAME',
        'USERDOMAIN',
        'SystemRoot',
        'SYSTEMROOT',
        'windir',
        'WINDIR',
        'ComSpec',
        'COMSPEC',
        'PATHEXT',
        'SystemDrive',
    ];
    for (const key of forward) {
        const value = parent[key];
        if (value)
            env[key] = value;
    }
    if (!env.SystemRoot && process.platform === 'win32')
        env.SystemRoot = 'C:\\Windows';
    // 代理放在最后合并：用户配置优先；未配置时转发宿主自身的代理环境，避免出现
    // 「宿主走代理、官方进程直连」的分裂路由（本机直连 Google 不通）。
    Object.assign(env, options.proxy ? buildProxyEnv(options.proxy) : ambientProxyEnv(parent));
    return env;
}
/** 经 ctx.subprocess 启动官方 ACP server（本文件不触碰 child_process）。 */
export function launchAcpAgent(subprocess, options) {
    const executable = options.executable;
    const binaryDir = dirname(executable);
    // 官方 zip 带 sibling（如 localharness_external.exe）。cwd 必须是二进制目录，
    // 否则 Windows 上进程立刻退出，stdout EOF，上层只会看到「ACP 链路已关闭」。
    const cwd = options.cwd ?? binaryDir;
    return subprocess.spawn({
        argv: [executable, ...(options.extraArgs ?? [])],
        cwd,
        env: officialAgentEnv({ binaryDir, tmpDir: options.tmpDir, proxy: options.proxy }),
        stdio: { stdin: 'pipe', stdout: 'pipe', stderr: { maxBytes: 64 * 1024 } },
        graceMs: 5_000,
        signal: options.signal,
    });
}
//# sourceMappingURL=agent-link.js.map