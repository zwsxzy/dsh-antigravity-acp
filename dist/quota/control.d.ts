import type { AcpLifecycleSnapshot } from '../runtime/lifecycle.js';
export interface AccountSnapshot {
    state: 'idle' | 'connecting' | 'cancelling' | 'connected' | 'cancelled' | 'error';
    message: string;
    updatedAt: string;
    runtime?: AcpLifecycleSnapshot;
    generationMode?: {
        requested: 'acp' | 'proxy';
        active: 'acp' | 'proxy';
        proxyRouterReady: boolean;
    };
}
export interface ModelSnapshot {
    status: 'ok' | 'error';
    models: Array<{
        id: string;
        name: string;
        inputModalities?: readonly string[];
    }>;
    message?: string;
}
export interface ControlOptions {
    connect(signal: AbortSignal): Promise<void>;
    warmup?(signal: AbortSignal): Promise<void>;
    runtime?(): AcpLifecycleSnapshot;
    modelSource?(): unknown;
    generationMode?(): AccountSnapshot['generationMode'];
    /** 代理模式下从 Host 控制层拒绝 ACP 登录与预热，避免旧客户端触发官方进程。 */
    acpEnabled?(): boolean;
    models(force: boolean): Promise<readonly {
        id: string;
        name: string;
        inputModalities?: readonly string[];
    }[]>;
}
export declare class SettingsControl {
    private readonly options;
    private controller?;
    private pending?;
    private closed;
    private snapshot;
    private rows;
    private modelSource;
    constructor(options: ControlOptions);
    account(action?: 'status' | 'login' | 'warmup' | 'cancel'): AccountSnapshot;
    models(force?: boolean): Promise<ModelSnapshot>;
    dispose(): Promise<void>;
    private set;
}
