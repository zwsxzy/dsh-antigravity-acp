import type { ContentBlock, GenerateOptions, RequestMessage } from '@deepseek-ai/dsh-llm';
/** Only model-visible values participate; durable message IDs are not prompt content. */
export declare function messageValue(message: RequestMessage): unknown;
/** Deterministic JSON: object keys sorted, so fingerprints survive property order. */
export declare function stable(value: unknown): string;
/** A continuation must be the exact request plus the assistant blocks we emitted and new tool results. */
export declare class ContinuationState {
    #private;
    constructor(options: GenerateOptions);
    emitted(block: ContentBlock): void;
    accepts(options: GenerateOptions, resultCount: number): boolean;
}
