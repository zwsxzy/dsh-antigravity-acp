/**
 * 额度 remote：把 `src/runtime/quota.ts` 的套餐额度快照经 Typert Gateway 暴露给
 * 浏览器端药丸（`remote.agyQuota.read`）。
 *
 * 接线手法参考 dsh-subusage（同宿主上已验证可用）：Service 继承
 * `TypertRemoteService`，再向 `typert.register` 提交 generated-contribution
 * 形态的 `invocations` 描述符。描述符按 `@deepseek-ai/dsh-typert-protocol`
 * 的 `InvocationDescriptor` / `TypertCodec` 实际类型书写，不臆造字段。
 *
 * `typert.register` 的 contribution 形态（package/face/schemas/model/invocations）
 * 以已安装壳的 `TypertContribution` 与 dsh-subusage 0.13.3 的实际调用为准；本包
 * 工作区依赖的 dsh-typert-protocol 只导出窄契约，故此处用结构化接口 + 类型守卫
 * 收窄，不用 `any` 掩盖。
 */
import type { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { InvocationDescriptor } from '@deepseek-ai/dsh-typert-protocol';
import type { QuotaDeps, QuotaSnapshot } from '../runtime/quota.js';
import type { CliRun } from '../runtime/agy-cli.js';
import type { SettingsControl, AccountSnapshot, ModelSnapshot } from './control.js';
import type { ProxyCredentialSource } from '../proxy/adapter.js';
import type { ProxyTransport } from '../proxy/transport.js';
export declare const PACKAGE_NAME = "dsh-bundle-antigravity-host";
/** Typert service / wire namespace。 */
export declare const AGY_QUOTA_SERVICE = "agyQuota";
/** `read` 的请求体：`force` 绕过缓存；`source` 防止旧模型误领新模式的额度。 */
export interface AgYQuotaRequest {
    force?: boolean;
    source?: 'acp' | 'proxy';
    model?: string;
}
/** 本包贡献的 invocation 描述符（直连一元调用）。 */
export declare const AGY_QUOTA_INVOCATIONS: readonly InvocationDescriptor[];
/** 把 contribution 提交给 Gateway；typert 服务缺席时静默跳过（无 Web 的 profile 也能加载）。 */
export declare function registerAgYQuotaRemote(ctx: Context): void;
export interface AgYQuotaServiceOptions {
    control?: SettingsControl;
    /** 测试注入面（fetch/文件/时钟等），生产不传。 */
    deps?: QuotaDeps;
    /**
     * 官方 CLI 只读取数通道（`agy -p /usage` 与 `agy -p /credits`）。
     * 仅当 {@link cliQuotaEnabled} 返回 true 时才会被使用；缺省 / 关闭时
     * 任何模式都不 spawn agy（套餐额度走内置直连，AI Credits 不查询）。
     */
    cli?: {
        run: CliRun;
        cliPath: string;
    };
    /** Re-detect installations without restarting the host. */
    resolveCli?: () => {
        run: CliRun;
        cliPath: string;
    } | undefined;
    /** 是否允许调用本机 agy CLI 取数；默认不允许（实时读取，可随设置即时切换）。 */
    cliQuotaEnabled?: () => boolean;
    /** 当前生成模式；代理模式下套餐额度改走代理账户取数。 */
    mode?: () => 'acp' | 'proxy';
    /** 已保存的官方模型映射，供药丸按实际家族选择额度组。 */
    modelTarget?: (model: string) => string | undefined;
    /** 代理模式额度取数面（凭据 + agy 线传输）；缺省时代理模式回落 ACP 口径。 */
    proxyQuota?: {
        credential: ProxyCredentialSource & {
            revision?(): number;
        };
        transport: ProxyTransport;
    };
    /** 宿主日志（index.ts 接 `ctx.logger`）；用于记录每次取数的来源与结果。 */
    log?: {
        info(message: string): void;
        warn(message: string, error?: unknown): void;
    };
}
/**
 * 额度取数服务：`read(request)` 返回快照，失败折叠成 `status: 'error'` 而不抛。
 *
 * 字段刻意用 TS `private` 而非 ES `#私有`：Cordis Service 的方法经 Proxy 调用，
 * `this` 是代理而非真实实例，`#x` 会抛 “Cannot read private member #x from an
 * object whose class did not declare it”。
 */
export declare class AgYQuotaService extends TypertRemoteService {
    private readonly _cache;
    private readonly _creditsCache;
    private readonly _deps;
    private readonly _cli;
    private readonly _resolveCli;
    private readonly _cliQuotaEnabled;
    private readonly _mode;
    private readonly _modelTarget;
    private readonly _proxyQuota;
    private readonly _log;
    private readonly _control;
    /** 在途取数：并发调用（多会话药丸 / 定时器 + 手动刷新）共享同一次取数，而不是各起一个进程。 */
    private _inflight;
    private _inflightMode;
    /** 在途取数是否真的绕过了缓存（而非「命中缓存」的即时返回）；force 的合并判定依据。 */
    private _inflightBypassed;
    /** _read 在首个 await 前同步写入，供 read() 判断在途请求是否真正全量刷新。 */
    private _readCacheStatus;
    /** 上次实际执行的 force 是否要求两路绕过缓存（在调用 _read 前失效）。 */
    private _forcedRead;
    /** 额度缓存所属的生成模式：跨模式的旧额度不展示（账户不同）。 */
    private _cacheMode;
    constructor(ctx: Context, options?: AgYQuotaServiceOptions);
    account(request?: {
        action: 'status' | 'login' | 'warmup' | 'cancel';
    }): AccountSnapshot;
    models(request?: AgYQuotaRequest): Promise<ModelSnapshot>;
    /** 客户端药丸的取数入口；并发调用合并为同一次取数。 */
    read(request?: AgYQuotaRequest): Promise<QuotaSnapshot>;
    private withModelRoute;
    private currentMode;
    /** 用户是否显式允许调用本机 agy CLI 取数；默认不允许。 */
    private cliQuotaOn;
    /**
     * 缓存身份纳入 CLI 开关：开关翻转后套餐额度与 Credits 都属于另一条取数
     * 口径（代理模式还意味着是否会 spawn agy），旧快照必须立即失效重取。
     */
    private currentAccountKey;
    private _read;
}
