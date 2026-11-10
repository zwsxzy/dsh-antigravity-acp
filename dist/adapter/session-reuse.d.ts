import type { ContentBlock, GenerateOptions, RequestMessage } from '@deepseek-ai/dsh-llm';
export declare function reusableSessionKey(options: Pick<GenerateOptions, 'sessionId' | 'purpose'>): string | undefined;
export declare function messageSourceKind(message: RequestMessage): string | undefined;
export declare function messageSourceForm(message: RequestMessage): string | undefined;
/** assistant 只有通过 outputMatches 验证后才可跳过；context form 本身不是丢弃依据。 */
export declare function shouldSendIncrement(message: RequestMessage): boolean;
/**
 * 只省略确实已经发送的相同上下文。快照/目录跟踪最近版本，A→B→A 仍须发送 A；
 * 指令也可能撤回/恢复旧版本，未知文件身份时保守按最近版本判断；仅召回材料按完整内容去重。
 */
export declare function incrementalMessages(messages: readonly RequestMessage[], sentCount: number): RequestMessage[];
export declare function messageFingerprint(message: RequestMessage): string;
export declare function prefixHash(messages: readonly RequestMessage[], count?: number): string;
export declare function prefixMatches(messages: readonly RequestMessage[], sentCount: number, sentHash: string): boolean;
/** 存储实际交付的 blocks 指纹，不落盘输出正文。 */
export declare function outputHash(blocks: readonly ContentBlock[]): string;
/** 新历史中的 assistant 必须正好是上一步交付的输出，且位于所有新输入之前。 */
export declare function outputMatches(fresh: readonly RequestMessage[], expected: string | undefined): boolean;
export declare function routeFingerprint(options: Pick<GenerateOptions, 'provider' | 'model' | 'reasoningEffort' | 'system' | 'tools'>, override?: {
    target?: string;
    effort?: string;
}): string;
