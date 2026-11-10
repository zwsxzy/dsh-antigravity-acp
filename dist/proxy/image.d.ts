import type { AttachmentStore, ImageAttachmentRef, ImageRequestTarget } from '@deepseek-ai/dsh-attachment';
import type { RequestMessage } from '@deepseek-ai/dsh-llm';
export declare const PROXY_REQUEST_IMAGE_MAX_PIXELS: number;
export declare const PROXY_REQUEST_IMAGE_MAX_BYTES: number;
/** 内联图片预算：base64 表示字节；超出即协商 offload。 */
export declare const PROXY_INLINE_IMAGE_BYTES: number;
export type ProxyAttachmentReader = Pick<AttachmentStore, 'readImage'> & {
    readImageRequest?(ref: ImageAttachmentRef, bounds: unknown, signal?: AbortSignal): Promise<{
        data: Uint8Array;
        mediaType: string;
    }>;
};
export interface ProxyImageRead {
    mediaType: string;
    encoded: string;
    bytes: number;
}
export declare function proxyImageRequestTarget(ref: ImageAttachmentRef): ImageRequestTarget;
/** 把已 offload 的图片投影成占位文本；未 offload 的保持原样。 */
export declare function projectProxyOffloadedImages(messages: readonly RequestMessage[]): readonly RequestMessage[];
/** 读取一张请求版本图片；优先 `readImageRequest`（带尺寸与字节上限）。 */
export declare function readProxyImage(attachments: ProxyAttachmentReader, ref: ImageAttachmentRef, signal: AbortSignal | undefined): Promise<ProxyImageRead>;
/**
 * 还需 offload 多少张最旧的保留图片才能让内联预算成立；0 表示当前请求放得下。
 * `sentBytes` 是本次实际发送的每张附件字节（base64 前），缺省时按引用上的 bytes 估。
 */
export declare function requiredProxyImageOffload(messages: readonly RequestMessage[], sentBytes: ReadonlyMap<string, number> | undefined): number;
