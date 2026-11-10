/**
 * 代理模式的 replay 元数据：块对齐的 thoughtSignature 保留。
 *
 * 口径与 dsh-tool-antigravity 的 replay.ts 相同（只保留上游签名的有界子集），
 * provider 标识为 `antigravity-proxy`，因此 ACP 模式的 replay 状态不会被
 * 代理模式误用，反之亦然。
 */
import type { Message, ReplayEnvelope, ToolSchema } from '@deepseek-ai/dsh-llm';
export declare const PROXY_REPLAY_VERSION: 1;
export declare const PROXY_PROVIDER_ID: "antigravity-proxy";
export declare const PROXY_MAX_SIGNATURE_LENGTH: number;
export type ReplayBlockKind = 'text' | 'reasoning' | 'tool-call';
export type ProxyModelFamily = 'gemini' | 'claude' | 'gpt-oss' | 'unknown';
export interface ProxyReplayBlock {
    readonly kind: ReplayBlockKind;
    readonly signature?: string;
}
export interface ProxyReplayState extends ReplayEnvelope {
    readonly response: {
        readonly version: typeof PROXY_REPLAY_VERSION;
        readonly provider: typeof PROXY_PROVIDER_ID;
        readonly model: string;
        readonly family: ProxyModelFamily;
        readonly wireModel?: string;
        readonly finish?: string;
    };
    readonly blocks: readonly ProxyReplayBlock[];
}
export declare function proxyModelFamily(model: string): ProxyModelFamily;
export declare function createProxyReplayState(model: string, family: ProxyModelFamily, finish: string | undefined, blocks: readonly ProxyReplayBlock[], wireModel?: string): ProxyReplayState;
/** 校验历史消息上的 replay 元数据；不兼容返回 undefined（按无签名重放）。 */
export declare function compatibleProxyReplayState(message: Message, model: string, blockKinds?: readonly ReplayBlockKind[], wireModel?: string): ProxyReplayState | undefined;
/** DSH 工具 schema → 上游 functionDeclarations 子集（有界、可序列化）。 */
export declare function buildProxyFunctionDeclarations(tools: readonly ToolSchema[] | undefined): readonly Record<string, unknown>[];
