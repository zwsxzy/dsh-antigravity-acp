/** ACP 运行时的内存状态与耗时；读取不触发连接，不保存聊天或工具参数。 */
import { redactSensitiveText } from './redact.js';
export class AcpLifecycle {
    now;
    phase = 'idle';
    phaseAt;
    processAt;
    startupAt;
    startupEnd;
    startupStep;
    startupTimings = {};
    roundAt;
    roundEnd;
    roundStep;
    promptAt;
    continuationAt;
    snapshot = { processRunning: false, starts: 0, reuses: 0, recycles: 0 };
    constructor(now = () => performance.now()) {
        this.now = now;
        this.phaseAt = now();
    }
    phaseChanged(phase) {
        this.phase = phase;
        this.phaseAt = this.now();
    }
    starting() {
        this.snapshot.starts++;
        delete this.snapshot.error;
        this.startupAt = this.now();
        this.startupEnd = undefined;
        this.startupTimings = {};
        this.startupStep = undefined;
        this.startupPhase('binary');
    }
    startupPhase(name) {
        this.finishStartupStep();
        this.startupStep = { name, at: this.now() };
        this.phaseChanged(name);
    }
    spawned() { this.snapshot.processRunning = true; this.processAt = this.now(); }
    ready() {
        this.finishStartupStep();
        this.startupEnd = this.now();
        this.phaseChanged('ready');
    }
    reused() { this.snapshot.reuses++; }
    stopped(phase = 'stopped') {
        this.finishStartupStep();
        if (this.startupAt !== undefined && this.startupEnd === undefined)
            this.startupEnd = this.now();
        this.snapshot.processRunning = false;
        this.processAt = undefined;
        if (this.roundAt !== undefined && this.roundEnd === undefined)
            this.roundEnd = this.now();
        this.phaseChanged(phase);
    }
    recycling() { this.snapshot.recycles++; this.phaseChanged('recycling'); }
    failed(error) {
        this.snapshot.error = redactSensitiveText(error instanceof Error ? error.message : String(error));
        this.finishStartupStep();
        if (this.startupAt !== undefined && this.startupEnd === undefined)
            this.startupEnd = this.now();
        if (this.roundAt !== undefined && this.roundEnd === undefined)
            this.roundEnd = this.now();
        this.phaseChanged('error');
    }
    beginRound(model) {
        delete this.snapshot.error;
        this.roundAt = this.now();
        this.roundEnd = this.promptAt = this.continuationAt = undefined;
        this.roundStep = undefined;
        this.snapshot.round = { model, elapsedMs: 0, timings: {}, continuations: 0 };
        this.roundPhase('connection');
    }
    roundPhase(name) {
        this.finishRoundStep();
        this.roundStep = { name, at: this.now() };
        this.phaseChanged(name);
    }
    promptSent() {
        this.finishRoundStep();
        this.promptAt = this.now();
        this.phaseChanged('prompt');
    }
    firstOutput(tool = false) {
        const round = this.snapshot.round;
        if (!round || this.promptAt === undefined)
            return;
        if (round.firstChunkMs === undefined)
            round.firstChunkMs = this.now() - this.promptAt;
        if (tool && round.firstToolMs === undefined)
            round.firstToolMs = this.now() - this.promptAt;
        if (this.phase === 'prompt' || this.phase === 'continuing')
            this.phaseChanged('streaming');
    }
    continuing() {
        if (this.snapshot.round)
            this.snapshot.round.continuations++;
        this.continuationAt = this.now();
        this.phaseChanged('continuing');
    }
    finish(kind) {
        const round = this.snapshot.round;
        if (!round)
            return;
        this.finishRoundStep();
        if (this.continuationAt !== undefined)
            round.lastContinuationMs = this.now() - this.continuationAt;
        if (kind === 'tool-calls')
            this.phaseChanged('waiting-tools');
        else {
            round.finish = kind;
            this.roundEnd = this.now();
            this.phaseChanged(kind === 'error' ? 'error' : this.snapshot.processRunning ? 'ready' : 'stopped');
        }
    }
    read() {
        const at = this.now();
        const result = { ...this.snapshot, phase: this.phase, phaseElapsedMs: at - this.phaseAt };
        if (this.processAt !== undefined)
            result.uptimeMs = at - this.processAt;
        if (this.startupAt !== undefined) {
            const timings = { ...this.startupTimings };
            if (this.startupStep)
                timings[this.startupStep.name] = at - this.startupStep.at;
            result.startup = { elapsedMs: (this.startupEnd ?? at) - this.startupAt, timings };
        }
        if (this.snapshot.round && this.roundAt !== undefined) {
            const timings = { ...this.snapshot.round.timings };
            if (this.roundStep)
                timings[this.roundStep.name] = at - this.roundStep.at;
            result.round = { ...this.snapshot.round, timings, elapsedMs: (this.roundEnd ?? at) - this.roundAt };
        }
        return result;
    }
    finishStartupStep() {
        if (this.startupStep)
            this.startupTimings[this.startupStep.name] = this.now() - this.startupStep.at;
        this.startupStep = undefined;
    }
    finishRoundStep() {
        if (this.roundStep && this.snapshot.round)
            this.snapshot.round.timings[this.roundStep.name] = this.now() - this.roundStep.at;
        this.roundStep = undefined;
    }
}
//# sourceMappingURL=lifecycle.js.map