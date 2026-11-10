import type { SubprocessRuntime } from '@deepseek-ai/dsh-subprocess';
import type { ProxySettings } from './proxy-env.js';
import type { QuotaGroup, QuotaSnapshot } from './quota.js';
/** 单次 CLI 只读调用的返回面（由宿主经 ctx.subprocess 实现）。 */
export interface CliRunResult {
    exitCode: number | null;
    stdout: string;
    stderr: string;
}
export interface CliRunRequest {
    argv: readonly string[];
    timeoutMs?: number;
}
export type CliRun = (request: CliRunRequest) => Promise<CliRunResult>;
/** 默认超时：CLI 启动会做登录/配置刷新，冷启动可达数秒。 */
export declare const AGY_CLI_TIMEOUT_MS = 45000;
/** CLI 候选优先级：显式配置、环境覆盖、PATH 绝对目录、各平台默认安装位置。 */
export declare function agyCliCandidates(env?: Readonly<Record<string, string | undefined>>, home?: string, explicitPath?: string, platform?: NodeJS.Platform): readonly string[];
/** CLI 取数失败（错误文本已脱敏，不含凭据）。 */
export declare class AgyCliError extends Error {
    readonly code: 'cli-missing' | 'cli-failed' | 'cli-bad-output';
    constructor(code: 'cli-missing' | 'cli-failed' | 'cli-bad-output', message: string);
}
/**
 * `agy models` 的输出解析：每行 `id<TAB>名称`。
 * 空行忽略；缺名称的行用 id 兜底，不编造名称。
 */
export declare function parseAgyModels(text: string): Array<{
    id: string;
    name: string;
}>;
/** 思考强度档位（官方模型 id 后缀），从弱到强。 */
export declare const AGY_REASONING_EFFORTS: readonly ["low", "medium", "high"];
export type AgyReasoningEffort = (typeof AGY_REASONING_EFFORTS)[number];
/** 显示名映射（档位标签与思考强度菜单同名）。 */
export declare const AGY_REASONING_EFFORT_NAMES: Record<AgyReasoningEffort, string>;
/**
 * 未选思考强度时的路由档位（官方 CLI 的默认模型是
 * `Gemini 3.8 Flash (Medium)`，与其中档一致）。
 */
export declare const DEFAULT_AGY_REASONING_EFFORT: AgyReasoningEffort;
/**
 * 用户明确排除的模型家族（2026-10-16 指示：gpt-oss-120b 临近下架，不进选择器）。
 * 按家族排除：`gpt-oss-120b` 与其全部档位变体一并不出现。
 */
export declare const AGY_MODEL_EXCLUDED_FAMILIES: ReadonlySet<string>;
/** 识别 id 的思考强度后缀；识别不出返回 undefined。 */
export declare function tierForModelId(id: string): AgyReasoningEffort | undefined;
/** 家族 id：去掉思考强度后缀；没有后缀时原样返回。 */
export declare function modelFamilyId(id: string): string;
/**
 * 把档位化的模型 id 折叠成家族条目，并记录各家族支持的档位。
 *
 * 模型选择只出**家族**（`claude-opus-5-5` 一行），思考强度由 DSH 的思考强度
 * 菜单选择后自动路由到对应档位模型（`claude-opus-5-5-high`）——2026-10-16
 * 用户指示「不要把思考强度单独放进模型，而是做一个路由」。
 * 被排除的家族（gpt-oss-120b）整组不出现。
 */
export declare function foldAgyModelFamilies(rows: readonly {
    id: string;
    name: string;
    description?: string;
}[]): {
    models: Array<{
        id: string;
        name: string;
        description?: string;
    }>;
    tiers: Map<string, ReadonlySet<AgyReasoningEffort>>;
};
/**
 * 家族 + 思考强度 → 官方档位模型 id。
 *
 * - 家族**有**档位变体：取请求档位；缺该档位时取最接近的已有档位
 *   （按 low→medium→high 顺序）；
 * - 家族**已知没有**档位变体（目录里的普通 id）：原样返回，不编造后缀；
 * - 家族未知（目录尚未观测到）：明确给了强度才拼后缀，否则原样返回。
 */
export declare function routeTieredModelId(familyId: string, effort: AgyReasoningEffort, tiers?: ReadonlySet<AgyReasoningEffort>): string;
/**
 * `-p /usage --output-format json` 的输出解析：命令结果在 `command.data.groups`。
 * 字段按官方形态（`window`/`remaining_fraction`/`reset_time`）映射到本包快照。
 */
export declare function parseAgyUsage(payload: unknown): QuotaGroup[];
/** 跑一次官方 CLI 的额度查询（slash 命令本地处理，无模型回合）。 */
export declare function fetchAgyUsage(run: CliRun, cliPath: string): Promise<QuotaSnapshot>;
/** 跑一次官方 CLI 的模型清单（只读列表，无模型回合）。 */
export declare function fetchAgyModels(run: CliRun, cliPath: string): Promise<Array<{
    id: string;
    name: string;
}>>;
/**
 * 用 DSH 的 subprocess 服务实现 {@link CliRun}（本模块不碰 child_process）。
 * 环境按最小可用集显式传入：Windows 系统键 + 用户目录键 + 出网代理键；
 * DSH_* 内部键一律不透传给官方二进制。
 */
export declare function createSubprocessCliRun(subprocess: SubprocessRuntime, proxy?: ProxySettings | undefined): CliRun;
/**
 * 官方 CLI 的最小环境：系统键 + 用户目录键 + 代理，其余不透传。
 *
 * **代理必须在这里补齐**：`agy` 每次启动都会做登录/配置刷新（实测无代理时
 * `-p /usage` 会一直挂在网络上、直到被杀），而 DSH 的 subprocess 会 scrub 父环境。
 * 宿主进程环境里未必有代理变量——插件配置的 `proxyUrl` 才是权威来源。规则与官方
 * ACP 进程保持一致：**插件配置优先，其次宿主环境自身导出的代理**。
 */
export declare function cliEnv(parent?: Readonly<Record<string, string | undefined>>, proxy?: ProxySettings | undefined): Record<string, string>;
