import { LlmAdapter } from '@deepseek-ai/dsh-llm';
import type { GenerateOptions, LlmModelInfo, LlmResolvedModelInfo, PreparedAdapterCall, StreamChunk } from '@deepseek-ai/dsh-llm';
import type { AcpLifecycleSnapshot } from '../runtime/lifecycle.js';
import type { AntigravityAcpAdapter } from '../adapter/antigravity-adapter.js';
/** Workers own independent transports, bridges and prompt state. No tool execution lives here. */
export interface AcpWorker {
    adapter: Pick<AntigravityAcpAdapter, 'busy' | 'stream' | 'listModels' | 'resolveModel' | 'warmup' | 'discoverModels'> & Partial<Pick<AntigravityAcpAdapter, 'prepareCall'>>;
    ensureImages?: (signal?: AbortSignal) => Promise<void>;
    read(): AcpLifecycleSnapshot;
    dispose(): Promise<void>;
}
export declare class PooledAcpAdapter extends LlmAdapter {
    private readonly create;
    private readonly slots;
    private readonly waiters;
    /** DSH 对话 → 承载它的 worker 下标：会话复用记录在 worker 内部，换 worker 即丢失。 */
    private readonly affinity;
    private closed;
    private poll?;
    private readonly capacity;
    private readonly queueTimeoutMs;
    private readonly readSessionAffinity;
    private get sessionAffinity();
    private preparation?;
    private preparationAbort?;
    private preparationWaiters;
    private prepared;
    private preparationGeneration;
    private disposal?;
    constructor(create: () => AcpWorker, options?: {
        capacity?: number;
        queueTimeoutMs?: number;
        sessionAffinity?: boolean | (() => boolean);
    });
    get busy(): boolean;
    providerInfo(provider: string): {
        id: string;
        name: string;
    };
    listModels(provider: string): Promise<readonly LlmModelInfo[]>;
    resolveModel(provider: string, model: string, signal?: AbortSignal): Promise<LlmResolvedModelInfo>;
    /** Recheck capabilities when host services change, without interrupting active callers. */
    invalidatePreparation(): void;
    prepareCall(provider: string, model: string, signal?: AbortSignal): Promise<PreparedAdapterCall>;
    stream(options: GenerateOptions): AsyncGenerator<StreamChunk>;
    warmup(signal?: AbortSignal): Promise<void>;
    discoverModels(signal?: AbortSignal, interactive?: boolean): Promise<readonly LlmModelInfo[]>;
    read(): AcpLifecycleSnapshot;
    dispose(): Promise<void>;
    private disposeWorkers;
    private addSlot;
    /** 只有普通聊天轮参与粘性；标题/压缩等一次性请求不占用会话绑定。 */
    private affinityKey;
    private rememberAffinity;
    private select;
    private acquire;
    private dispatch;
}
