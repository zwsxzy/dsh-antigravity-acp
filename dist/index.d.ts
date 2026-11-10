import type { Context } from '@deepseek-ai/cordis';
import type { ClientCapabilities } from '@agentclientprotocol/sdk';
import type { SubprocessHandle, SubprocessRuntime } from '@deepseek-ai/dsh-subprocess';
import { AgentLink } from './protocol/agent-link.js';
import type { AgentLinkHandlers } from './protocol/agent-link.js';
import type { RuntimeDirectoryLease } from './runtime/binary.js';
import type { AcpCredentialResult } from './runtime/credentials.js';
import { AcpLifecycle } from './runtime/lifecycle.js';
import type { AntigravityHostConfig, AntigravityPluginConfig } from './settings.js';
export { AGY_PROVIDER_ID } from './adapter/antigravity-adapter.js';
export { Config } from './settings.js';
export type { AntigravityHostConfig } from './settings.js';
declare module '@deepseek-ai/cordis' {
    interface Events {
        'loader/volatile-update'(paths: string[][]): void;
    }
}
export declare const name = "llm-antigravity-acp";
export declare const inject: string[];
/**
 * 本插件向 agent 声明的 client 能力：**全部关闭**。
 *
 * 无人值守原则：工具一律经私有 loopback MCP 桥暴露给 agent，agent 不直接
 * 触碰宿主文件系统或终端。因此 fs 读写与 terminal 全部为 false，agent 若仍
 * 发起这些原生请求，会被 adapter 记为「非预期原生活动」并终止回合
 * （见 adapter/prompt-turn.ts）。elicitation 也一并关闭：无人应答可收集。
 */
export declare const AGY_CLIENT_CAPABILITIES: ClientCapabilities;
/** 本插件持有并需在 dispose 时清理的活动 ACP 资源。 */
export interface ActiveAcpRuntime {
    directory?: RuntimeDirectoryLease;
    lifecycle?: AcpLifecycle;
    link?: AgentLink;
    handle?: SubprocessHandle;
    /**
     * 正在进行的启动流程。`ensureAcpRuntime` 的判重到写入 `link` 之间横跨
     * `ensureAgentBinary` / `mkdir` / spawn 多个 await，仅靠同步的 `active.link`
     * 检查无法阻止并发首轮各自 spawn 一条官方进程（进而孤儿一条 handle、双弹一次
     * OAuth）。这个 promise 让并发调用汇聚到同一次启动。
     */
    inflight?: Promise<AgentLink>;
    /** 插件已卸载。置位后不再启动新链路，dispose 会等在途启动收尾再清理。 */
    disposed?: boolean;
    /** 卸载时中止在途的二进制下载（否则卸载要等一次可能长达数分钟的下载）。 */
    abort?: AbortController;
    /** 插件进程内私有 loopback MCP 桥的关闭钩子（由 adapter 登记）。 */
    bridgeTeardown?: () => Promise<void>;
}
/**
 * 清理顺序（apply 的 dispose 与测试共用同一条路径）：
 *
 * 1. 置 `disposed`，让此后进来的 `ensureAcpRuntime` 立刻失败而不是再 spawn；
 * 2. **先切断链路**：`link?.close()` + `handle?.terminate()`。必须在等 in-flight
 *    之前做——否则一个正卡在 `authenticate`（最长 `authTimeoutMs`，默认 5 分钟）
 *    的启动会把卸载拖到用户点完登录为止，而调用方还会拿到一条刚认证成功、
 *    随即被关掉的链接（假成功）；
 * 3. 等在途启动收尾。它此时会因链路断开而失败，错误被吞掉；仍兜住一种极端情况：
 *    in-flight 已经越过 spawn、还没来得及 terminate 自己的 handle。
 * 4. 关闭私有 MCP 桥。
 */
export declare function disposeAcpRuntime(active: ActiveAcpRuntime): Promise<void>;
export type { AgentLinkHandlers };
/** 回收失败/取消的连接与其受管进程，不卸载插件；旧连接不能终止后来者。 */
export declare function recycleAcpRuntime(active: ActiveAcpRuntime, link: AgentLink): Promise<void>;
/**
 * 启动路径上的可注入外部依赖。
 *
 * 两者都是「会碰真实环境」的动作（读/写用户 profile、跑系统命令），生产用默认
 * 实现，测试用假实现——否则单元测试会去动真实登录态、并让假 subprocess 收到一条
 * 它不认识的 icacls 进程。
 */
export interface AcpRuntimeDeps {
    /** 预热只使用已有登录态，不触发浏览器登录。 */
    allowInteractiveAuth?: boolean;
    /** 当前启动请求的取消信号，不改变宿主权限。 */
    signal?: AbortSignal;
    /** 插件自身 HTTPS 请求（下载、换发）所用的 fetch；默认按配置的代理构造。 */
    fetchImpl?: typeof fetch;
    /** 备好官方登录态（acp_token.json + settings.json）；默认导入本机官方 CLI 凭据。 */
    ensureCredentials?: () => Promise<AcpCredentialResult>;
    /** Windows 低完整性探测；默认经 ctx.subprocess 只读跑一次 icacls。 */
    probeLowIntegrity?: (executablePath: string, subprocess: SubprocessRuntime) => Promise<boolean>;
}
/**
 * 创建并启动 ACP 运行时（解析二进制 → ctx.subprocess spawn → initialize →
 * authenticate）。
 *
 * **single-flight**：并发调用共享同一个启动 promise，只 spawn 一条官方进程、
 * 只 authenticate 一次。
 *
 * 三条判定的顺序是有讲究的，**不可交换**：
 * 1. `disposed` 优先——插件卸载后不接受任何启动；
 * 2. `inflight` 必须在 `link` 之前：`authenticate` 可能要等人工在浏览器完成授权
 *    （默认 5 分钟），期间到达的调用必须汇聚到同一次启动，而**不能**拿到一条尚未
 *    认证的链接去 `session/new`；
 * 3. `link` 只在 initialize + authenticate **都成功后**才被写入（见
 *    `startAcpRuntime`），因此它可复用即代表链路已认证。
 *
 * 失败不留残骸：initialize / authenticate 任一失败（异常或超时）都会关闭旧
 * link、终止旧 handle、清掉 inflight 后再抛出原错误，保证下次调用能全新重试，
 * 而不是复用一条死链或缓存一个 rejected promise。
 */
export declare function ensureAcpRuntime(ctx: Context, config: AntigravityHostConfig, handlers: AgentLinkHandlers, active: ActiveAcpRuntime, deps?: AcpRuntimeDeps): Promise<AgentLink>;
/** 设置页显式连接：独立运行时，只建空工具会话验证认证，不发送模型 prompt。 */
export declare function connectAcpAccount(ctx: Context, config: AntigravityHostConfig, signal: AbortSignal, deps?: AcpRuntimeDeps): Promise<import("@agentclientprotocol/sdk").NewSessionResponse>;
export declare function apply(ctx: Context, input: AntigravityPluginConfig): void;
