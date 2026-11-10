import type { ImageAttachmentRef, ImageRequestTarget } from '@deepseek-ai/dsh-attachment';
import { LlmAdapter } from '@deepseek-ai/dsh-llm';
import type { GenerateOptions, LlmModelInfo, LlmProviderInfo, LlmResolvedModelInfo, PreparedAdapterCall, ResolvedRetryPolicy, StreamChunk } from '@deepseek-ai/dsh-llm';
import { PROXY_PROVIDER_ID } from './replay.js';
import { normalizeReasoningEffort } from './payload.js';
import type { ProxyAttachmentReader } from './image.js';
import type { ProxyTransport } from './transport.js';
import { PROXY_RESPONSE_HEADER_TIMEOUT_MS } from './transport.js';
import type { ProxyCredential } from './account-store.js';
import type { AntigravityHostConfig } from '../settings.js';
export { PROXY_PROVIDER_ID };
export interface ProxyCredentialSource {
    /** 取一份可用凭据；`forceRefresh` 表示先换发再返回。无登录态返回 undefined。 */
    credential(signal?: AbortSignal, options?: {
        forceRefresh?: boolean;
    }): Promise<ProxyCredential | undefined>;
}
/** 设置页读取当前代理路由的目录，手动刷新绕过目录缓存。 */
export interface ProxyModelCatalog {
    models(force: boolean): Promise<readonly LlmModelInfo[]>;
}
export interface ProxyAdapterOptions {
    credential: ProxyCredentialSource;
    transport?: ProxyTransport;
    responseHeaderTimeoutMs?: number;
    /** 宿主附件服务的惰性读取面；缺席时图片输入报 UNSUPPORTED_MODALITY，文本能力不受影响。 */
    attachments?: () => ProxyAttachmentReader | undefined;
    readSettings?: () => Pick<AntigravityHostConfig, 'modelOverrides'>;
    log?: {
        info(message: string): void;
        warn(message: string, error?: unknown): void;
    };
}
export declare class AntigravityProxyAdapter extends LlmAdapter {
    private readonly options;
    private readonly sessions;
    private readonly definitions;
    private catalogKey;
    private catalogRevision;
    private catalogLastGoodKey;
    private catalogLastGoodIds;
    private catalogExpiresAt;
    private catalogModelIds;
    private catalogFailureCode;
    constructor(options: ProxyAdapterOptions & {
        transport: ProxyTransport;
    });
    providerInfo(provider: string): LlmProviderInfo;
    providerRetryPolicy(_provider: string): ResolvedRetryPolicy | undefined;
    /** 凭据或模式变化后丢弃账户绑定的目录缓存。 */
    invalidateModelCatalog(): void;
    listModels(provider: string, signal?: AbortSignal): Promise<readonly LlmModelInfo[]>;
    discoverModels(force?: boolean, signal?: AbortSignal): Promise<readonly LlmModelInfo[]>;
    resolveModel(provider: string, model: string, _signal?: AbortSignal): Promise<LlmResolvedModelInfo>;
    prepareCall(provider: string, model: string, _signal?: AbortSignal): Promise<PreparedAdapterCall>;
    imageRequestTarget(provider: string, _model: string, image: ImageAttachmentRef): ImageRequestTarget;
    private captureGeneration;
    private readCredential;
    private wireModel;
    private resolveModelInGeneration;
    private definitionForWireModel;
    stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
    private streamInGeneration;
    private streamResponse;
    private pinnedTextModelInfos;
    private readLiveModelIds;
    private assertCatalogCurrent;
    private rememberCatalogFailure;
}
export declare function cleanModelDisplayName(name: string): string;
export { PROXY_RESPONSE_HEADER_TIMEOUT_MS };
export { normalizeReasoningEffort };
