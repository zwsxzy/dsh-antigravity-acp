export interface AcpLifecycleSnapshot {
    phase: string;
    phaseElapsedMs: number;
    processRunning: boolean;
    uptimeMs?: number;
    starts: number;
    reuses: number;
    recycles: number;
    startup?: {
        elapsedMs: number;
        timings: Record<string, number>;
    };
    round?: {
        model: string;
        elapsedMs: number;
        timings: Record<string, number>;
        firstChunkMs?: number;
        firstToolMs?: number;
        continuations: number;
        lastContinuationMs?: number;
        finish?: string;
    };
    error?: string;
    /** Shared provider scheduler state. No session identifiers or content leave the host. */
    queue?: {
        active: number;
        waiting: number;
        capacity: number;
        workers: number;
        parked: number;
    };
    modelCatalogRevision?: number;
}
export declare class AcpLifecycle {
    private readonly now;
    private phase;
    private phaseAt;
    private processAt?;
    private startupAt?;
    private startupEnd?;
    private startupStep?;
    private startupTimings;
    private roundAt?;
    private roundEnd?;
    private roundStep?;
    private promptAt?;
    private continuationAt?;
    private snapshot;
    constructor(now?: () => number);
    phaseChanged(phase: string): void;
    starting(): void;
    startupPhase(name: string): void;
    spawned(): void;
    ready(): void;
    reused(): void;
    stopped(phase?: string): void;
    recycling(): void;
    failed(error: unknown): void;
    beginRound(model: string): void;
    roundPhase(name: string): void;
    promptSent(): void;
    firstOutput(tool?: boolean): void;
    continuing(): void;
    finish(kind: string): void;
    read(): AcpLifecycleSnapshot;
    private finishStartupStep;
    private finishRoundStep;
}
