import type { ContentBlock as DshContentBlock, RequestMessage, ToolSchema } from '@deepseek-ai/dsh-llm';
import type { ImageAttachmentRef, StoredImageAttachment } from '@deepseek-ai/dsh-attachment';
import type { ContentBlock } from '@agentclientprotocol/sdk';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
export type ImageReader = (ref: ImageAttachmentRef, signal?: AbortSignal) => Promise<StoredImageAttachment>;
export interface ImageContentOptions {
    readImage?: ImageReader;
    supported: boolean;
    signal?: AbortSignal;
}
/** Native image blocks follow the message envelope that owns them; bytes only come from the host attachment service. */
export declare function buildPromptWithImages(system: string | undefined, messages: readonly RequestMessage[], tools: readonly ToolSchema[], options: ImageContentOptions): Promise<ContentBlock[]>;
/**
 * 复用 ACP 会话时的增量 prompt：只编码本轮新增消息。
 *
 * 会话已有原生历史（真机验证官方 agent 会保留上下文），因此不再重复
 * system / 工具策略 / 旧消息；这些新增消息本身就是本轮的用户输入。
 */
export declare function buildPromptDeltaWithImages(messages: readonly RequestMessage[], options: ImageContentOptions): Promise<ContentBlock[]>;
export declare function buildToolResultContent(blocks: readonly DshContentBlock[], options: ImageContentOptions): Promise<CallToolResult['content']>;
