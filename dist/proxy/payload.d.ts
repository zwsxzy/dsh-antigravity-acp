/**
 * 代理模式的请求构造：DSH 消息 → Cloud Code Assist `streamGenerateContent` 线载荷。
 *
 * 口径与 dsh-tool-antigravity 的 llm-adapter 一致，复用 core 的
 * `applyClaudeTransforms` / `applyGeminiTransforms` / `buildAgyAgentRequestMetadata`
 * 等审计变换；本模块只负责消息映射与有界化：
 * - system / developer 文本 → `systemInstruction.parts`；
 * - assistant → role `model`，tool 结果 → `functionResponse`；
 * - thoughtSignature 优先取块自带值，其次取 replay 元数据，functionCall 缺签名时
 *   补官方 sentinel（`skip_thought_signature_validator`），Claude 家族仅首个 call 带签名；
 * - 图片经宿主附件服务有界读取后转 `inlineData`（见 image.ts）；附件服务缺席时
 *   报 `UNSUPPORTED_MODALITY` 而不是静默丢弃；上游返回媒体输出仍按协议漂移拒绝。
 */
import { AgyRequestSessionStore } from '@cortexkit/antigravity-auth-core';
import type { GenerateOptions, TokenUsage } from '@deepseek-ai/dsh-llm';
import type { ProxyReplayBlock } from './replay.js';
import type { ProxyAttachmentReader } from './image.js';
export interface ProxyCredentialForPayload {
    projectId?: string;
}
export interface ProxyGeneratePayload {
    project?: string;
    requestId: string;
    request: Record<string, unknown>;
    model: string;
    userAgent: 'antigravity';
    requestType: 'agent';
    /** 本次实际发送的每张附件字节（base64 前）；供 offload 协商计费。 */
    sentImageBytes: Map<string, number>;
}
export declare const PROXY_SESSION_STORE_KEY = "dsh-antigravity-proxy";
/** 进程内会话上下文（labels / sessionId 的连续性），与参考实现同口径。 */
export declare function createProxySessionStore(): AgyRequestSessionStore;
export declare function proxySessionKey(options: GenerateOptions): string;
/** 解析线模型：档位后缀 → core 的别名解析。 */
export declare function resolveProxyWireModel(model: string, reasoningEffort?: string): string;
export declare function normalizeReasoningEffort(value: string | undefined): 'low' | 'medium' | 'high' | undefined;
export declare function buildProxyGeneratePayload(options: GenerateOptions, credential: ProxyCredentialForPayload, sessions: AgyRequestSessionStore, timestamp: number, attachments?: ProxyAttachmentReader, signal?: AbortSignal, wireModelOverride?: string): Promise<ProxyGeneratePayload>;
/** 请求成功完成后推进会话步数（labels 的 last_step_index 连续性）。 */
export declare function completeProxyExecution(sessions: AgyRequestSessionStore, options: GenerateOptions): void;
export interface ProxyProviderPart {
    kind: 'text' | 'reasoning' | 'tool-call';
    text?: string;
    name?: string;
    id?: string;
    arguments?: string;
    /** 对象参数代表一条完整调用；字符串参数仍可分片追加。 */
    argumentsComplete?: boolean;
    signature?: string;
    /** A trailing signature without a new content part belongs to the open block. */
    signatureOnly?: boolean;
}
export interface ProxyProviderEvent {
    parts: readonly ProxyProviderPart[];
    usage?: TokenUsage;
    finish?: string;
    error?: {
        status?: number;
        code?: string;
        contextWindowExceeded?: boolean;
    };
}
/** 解析一条 SSE data（兼容 `)]}'` 前缀与多种响应包裹形态）。 */
export declare function parseProxyProviderEvent(data: string): ProxyProviderEvent;
export declare function parseProxyUsage(value: unknown): TokenUsage | undefined;
export declare function parseProxyReplayBlocks(event: ProxyProviderEvent): ProxyReplayBlock[];
export declare function reportsContextWindowExceeded(value: Record<string, unknown>, depth?: number): boolean;
