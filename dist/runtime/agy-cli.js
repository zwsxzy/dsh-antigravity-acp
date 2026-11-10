/**
 * 官方 `agy` CLI 的**只读取数**通道：套餐额度（`-p /usage`）与模型清单
 * （`models`）；AI Credits（`-p /credits`）复用本模块 CliRun，见 credits.ts。
 *
 * 授权边界（2026-10-16 用户明确批准）：放宽「不 wrap agy CLI」，**仅限只读取数
 * 用途**。本模块只做两件事：
 * - `-p /usage --output-format json`：slash 命令由 CLI 本地处理（实测
 *   `num_turns: 0`、`total_tokens: 0`，无任何模型回合）；
 * - `models`：列出官方模型 id/名称。
 *
 * 绝不发对话、绝不写文件、绝不读写凭据。子进程一律经 DSH 的 subprocess 服务
 * （本模块通过 {@link CliRun} 注入，不碰 child_process），失败折叠为可读错误。
 */
import { homedir } from 'node:os';
import { dirname, posix, win32 } from 'node:path';
import { redactSensitiveText } from './redact.js';
import { ambientProxyEnv, buildProxyEnv } from './proxy-env.js';
/** 默认超时：CLI 启动会做登录/配置刷新，冷启动可达数秒。 */
export const AGY_CLI_TIMEOUT_MS = 45_000;
/** CLI 候选优先级：显式配置、环境覆盖、PATH 绝对目录、各平台默认安装位置。 */
export function agyCliCandidates(env = process.env, home = homedir(), explicitPath, platform = process.platform) {
    const override = explicitPath?.trim() || env.AGY_CLI_BIN?.trim();
    if (override)
        return [override];
    const paths = platform === 'win32' ? win32 : posix;
    const executable = platform === 'win32' ? 'agy.exe' : 'agy';
    const searchPath = Object.entries(env).find(([key]) => platform === 'win32' ? key.toLowerCase() === 'path' : key === 'PATH')?.[1];
    // 跳过空条目与相对目录，避免从当前工作区意外加载同名文件。
    const fromPath = (searchPath ?? '').split(paths.delimiter)
        .map((entry) => entry.trim().replace(/^"(.*)"$/, '$1'))
        .filter((entry) => paths.isAbsolute(entry))
        .map((entry) => paths.join(entry, executable));
    const localAppData = env.LOCALAPPDATA?.trim();
    const defaults = platform === 'win32'
        ? [...(localAppData ? [win32.join(localAppData, 'agy', 'bin', 'agy.exe')] : []), win32.join(home, 'AppData', 'Local', 'agy', 'bin', 'agy.exe')]
        : [posix.join(home, '.local', 'bin', 'agy'), posix.join(home, 'bin', 'agy')];
    return [...new Set([...fromPath, ...defaults])];
}
/** CLI 取数失败（错误文本已脱敏，不含凭据）。 */
export class AgyCliError extends Error {
    code;
    constructor(code, message) {
        super(redactSensitiveText(message));
        this.name = 'AgyCliError';
        this.code = code;
    }
}
/**
 * `agy models` 的输出解析：每行 `id<TAB>名称`。
 * 空行忽略；缺名称的行用 id 兜底，不编造名称。
 */
export function parseAgyModels(text) {
    const out = [];
    const seen = new Set();
    for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed)
            continue;
        const tab = trimmed.indexOf('\t');
        const id = (tab === -1 ? trimmed : trimmed.slice(0, tab)).trim();
        const name = (tab === -1 ? '' : trimmed.slice(tab + 1)).trim();
        if (!id || seen.has(id))
            continue;
        seen.add(id);
        out.push({ id, name: name || id });
    }
    return out;
}
/** 思考强度档位（官方模型 id 后缀），从弱到强。 */
export const AGY_REASONING_EFFORTS = ['low', 'medium', 'high'];
/** 显示名映射（档位标签与思考强度菜单同名）。 */
export const AGY_REASONING_EFFORT_NAMES = {
    low: '低',
    medium: '中',
    high: '高',
};
/**
 * 未选思考强度时的路由档位（官方 CLI 的默认模型是
 * `Gemini 3.8 Flash (Medium)`，与其中档一致）。
 */
export const DEFAULT_AGY_REASONING_EFFORT = 'medium';
/**
 * 用户明确排除的模型家族（2026-10-16 指示：gpt-oss-120b 临近下架，不进选择器）。
 * 按家族排除：`gpt-oss-120b` 与其全部档位变体一并不出现。
 */
export const AGY_MODEL_EXCLUDED_FAMILIES = new Set(['gpt-oss-120b']);
/** 识别 id 的思考强度后缀；识别不出返回 undefined。 */
export function tierForModelId(id) {
    const match = /-(low|medium|high)$/.exec(id);
    return match ? match[1] : undefined;
}
/** 家族 id：去掉思考强度后缀；没有后缀时原样返回。 */
export function modelFamilyId(id) {
    const tier = tierForModelId(id);
    return tier === undefined ? id : id.slice(0, -(tier.length + 1));
}
/** 显示名里的档位标签（如 `Claude Opus 5.5 (High)` → `Claude Opus 5.5`）。 */
function stripTierLabel(name) {
    return name.replace(/\s*\((low|medium|high)\)\s*$/i, '').trim() || name;
}
/**
 * 把档位化的模型 id 折叠成家族条目，并记录各家族支持的档位。
 *
 * 模型选择只出**家族**（`claude-opus-5-5` 一行），思考强度由 DSH 的思考强度
 * 菜单选择后自动路由到对应档位模型（`claude-opus-5-5-high`）——2026-10-16
 * 用户指示「不要把思考强度单独放进模型，而是做一个路由」。
 * 被排除的家族（gpt-oss-120b）整组不出现。
 */
export function foldAgyModelFamilies(rows) {
    const families = new Map();
    for (const row of rows) {
        const tier = tierForModelId(row.id);
        const familyId = modelFamilyId(row.id);
        if (AGY_MODEL_EXCLUDED_FAMILIES.has(familyId))
            continue;
        const entry = families.get(familyId) ?? {
            id: familyId,
            name: stripTierLabel(row.name),
            ...(row.description === undefined ? {} : { description: row.description }),
            tiers: new Set(),
        };
        if (tier)
            entry.tiers.add(tier);
        if (entry.name === familyId && stripTierLabel(row.name) !== row.name)
            entry.name = stripTierLabel(row.name);
        families.set(familyId, entry);
    }
    const tiers = new Map();
    const models = [];
    for (const entry of families.values()) {
        models.push({
            id: entry.id,
            name: entry.name,
            ...(entry.description === undefined ? {} : { description: entry.description }),
        });
        tiers.set(entry.id, entry.tiers);
    }
    return { models, tiers };
}
/**
 * 家族 + 思考强度 → 官方档位模型 id。
 *
 * - 家族**有**档位变体：取请求档位；缺该档位时取最接近的已有档位
 *   （按 low→medium→high 顺序）；
 * - 家族**已知没有**档位变体（目录里的普通 id）：原样返回，不编造后缀；
 * - 家族未知（目录尚未观测到）：明确给了强度才拼后缀，否则原样返回。
 */
export function routeTieredModelId(familyId, effort, tiers) {
    if (tiers && tiers.size === 0)
        return familyId;
    if (tiers && tiers.size > 0) {
        if (tiers.has(effort))
            return `${familyId}-${effort}`;
        const order = AGY_REASONING_EFFORTS;
        const wanted = order.indexOf(effort);
        let best;
        let bestDistance = Number.POSITIVE_INFINITY;
        for (const candidate of order) {
            if (!tiers.has(candidate))
                continue;
            const distance = Math.abs(order.indexOf(candidate) - wanted);
            if (distance < bestDistance) {
                best = candidate;
                bestDistance = distance;
            }
        }
        return best === undefined ? familyId : `${familyId}-${best}`;
    }
    return `${familyId}-${effort}`;
}
/**
 * `-p /usage --output-format json` 的输出解析：命令结果在 `command.data.groups`。
 * 字段按官方形态（`window`/`remaining_fraction`/`reset_time`）映射到本包快照。
 */
export function parseAgyUsage(payload) {
    if (typeof payload !== 'object' || payload === null)
        return [];
    const command = payload.command;
    if (typeof command !== 'object' || command === null)
        return [];
    const data = command.data;
    if (typeof data !== 'object' || data === null)
        return [];
    const groups = data.groups;
    if (!Array.isArray(groups))
        return [];
    const out = [];
    for (const raw of groups) {
        if (typeof raw !== 'object' || raw === null)
            continue;
        const group = raw;
        const buckets = [];
        const rawBuckets = Array.isArray(group.buckets) ? group.buckets : [];
        for (const rawBucket of rawBuckets) {
            if (typeof rawBucket !== 'object' || rawBucket === null)
                continue;
            const bucket = rawBucket;
            const fraction = typeof bucket.remaining_fraction === 'number' && Number.isFinite(bucket.remaining_fraction)
                && bucket.remaining_fraction >= 0 && bucket.remaining_fraction <= 1
                ? bucket.remaining_fraction
                : undefined;
            buckets.push({
                name: firstString(bucket.name) ?? firstString(bucket.id) ?? '额度',
                ...(firstString(bucket.description) === undefined ? {} : { description: firstString(bucket.description) }),
                ...(firstString(bucket.window) === undefined ? {} : { window: firstString(bucket.window) }),
                ...(fraction === undefined
                    ? {}
                    : { remainingFraction: fraction, remainingPct: Math.round(fraction * 10000) / 100 }),
                ...(firstString(bucket.reset_time) === undefined ? {} : { resetTime: firstString(bucket.reset_time) }),
                disabled: false,
            });
        }
        out.push({
            name: firstString(group.name) ?? '额度',
            ...(firstString(group.description) === undefined ? {} : { description: firstString(group.description) }),
            buckets,
        });
    }
    return out;
}
/** 跑一次官方 CLI 的额度查询（slash 命令本地处理，无模型回合）。 */
export async function fetchAgyUsage(run, cliPath) {
    const stamp = new Date().toISOString();
    let result;
    try {
        result = await run({ argv: [cliPath, '-p', '/usage', '--output-format', 'json'], timeoutMs: AGY_CLI_TIMEOUT_MS });
    }
    catch (error) {
        return usageFailure(stamp, error);
    }
    if (result.exitCode !== 0) {
        return usageFailure(stamp, new AgyCliError('cli-failed', `agy /usage 退出码 ${result.exitCode}：${result.stderr.slice(-300)}`));
    }
    let payload;
    try {
        payload = JSON.parse(result.stdout);
    }
    catch {
        return usageFailure(stamp, new AgyCliError('cli-bad-output', 'agy /usage 输出不是合法 JSON'));
    }
    const envelope = typeof payload === 'object' && payload !== null ? payload : {};
    const command = typeof envelope.command === 'object' && envelope.command !== null
        ? envelope.command
        : {};
    if (envelope.status !== 'SUCCESS' || command.name !== 'usage') {
        return usageFailure(stamp, new AgyCliError('cli-bad-output', 'agy /usage 未返回成功的本地额度报告'));
    }
    const groups = parseAgyUsage(payload);
    if (groups.length === 0) {
        return usageFailure(stamp, new AgyCliError('cli-bad-output', 'agy /usage 输出里没有额度分组'));
    }
    const data = typeof command.data === 'object' && command.data !== null
        ? command.data
        : {};
    const plan = firstString(data.plan) ?? firstString(data.tier);
    return {
        status: 'ok',
        updatedAt: stamp,
        ...(plan === undefined ? {} : { plan }),
        groups,
    };
}
function usageFailure(updatedAt, error) {
    const message = error instanceof AgyCliError
        ? error.message
        : redactSensitiveText(error instanceof Error ? error.message : String(error));
    return { status: 'error', updatedAt, groups: [], error: { code: 'request-failed', message } };
}
/** 跑一次官方 CLI 的模型清单（只读列表，无模型回合）。 */
export async function fetchAgyModels(run, cliPath) {
    const result = await run({ argv: [cliPath, 'models'], timeoutMs: AGY_CLI_TIMEOUT_MS });
    if (result.exitCode !== 0) {
        throw new AgyCliError('cli-failed', `agy models 退出码 ${result.exitCode}：${result.stderr.slice(-300)}`);
    }
    const models = parseAgyModels(result.stdout);
    if (models.length === 0) {
        throw new AgyCliError('cli-bad-output', 'agy models 输出里没有模型');
    }
    return models;
}
function firstString(value) {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}
/**
 * 用 DSH 的 subprocess 服务实现 {@link CliRun}（本模块不碰 child_process）。
 * 环境按最小可用集显式传入：Windows 系统键 + 用户目录键 + 出网代理键；
 * DSH_* 内部键一律不透传给官方二进制。
 */
export function createSubprocessCliRun(subprocess, proxy) {
    return async ({ argv, timeoutMs }) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs ?? AGY_CLI_TIMEOUT_MS);
        try {
            const handle = subprocess.spawn({
                argv,
                // cwd 用 CLI 自身目录：与 ACP server 的启动约定一致，避免工作目录
                // 影响官方二进制的相对资源解析。
                cwd: dirname(String(argv[0])),
                env: cliEnv(process.env, proxy),
                stdio: {
                    stdin: 'ignore',
                    stdout: { maxBytes: 512 * 1024 },
                    stderr: { maxBytes: 32 * 1024 },
                },
                graceMs: 5_000,
                signal: controller.signal,
            });
            const outcome = await handle.done;
            return {
                exitCode: outcome.exitCode,
                stdout: handle.collected.stdout?.readFrom(0).text ?? '',
                stderr: handle.collected.stderr?.readFrom(0).text ?? '',
            };
        }
        finally {
            clearTimeout(timer);
        }
    };
}
/**
 * 官方 CLI 的最小环境：系统键 + 用户目录键 + 代理，其余不透传。
 *
 * **代理必须在这里补齐**：`agy` 每次启动都会做登录/配置刷新（实测无代理时
 * `-p /usage` 会一直挂在网络上、直到被杀），而 DSH 的 subprocess 会 scrub 父环境。
 * 宿主进程环境里未必有代理变量——插件配置的 `proxyUrl` 才是权威来源。规则与官方
 * ACP 进程保持一致：**插件配置优先，其次宿主环境自身导出的代理**。
 */
export function cliEnv(parent = process.env, proxy) {
    const keys = [
        'SystemRoot', 'SystemDrive', 'windir', 'COMSPEC', 'ComSpec', 'PATHEXT', 'PATH',
        'USERPROFILE', 'HOME', 'HOMEDRIVE', 'HOMEPATH', 'USERNAME', 'USER',
        'LOCALAPPDATA', 'APPDATA', 'TEMP', 'TMP', 'TMPDIR',
    ];
    const env = {};
    for (const key of keys) {
        const value = parent[key];
        if (value !== undefined && value !== '')
            env[key] = value;
    }
    // 代理最后合并：配置的 proxyUrl 覆盖宿主环境里的同名键。
    const proxyEnv = proxy ? buildProxyEnv(proxy) : ambientProxyEnv(parent);
    for (const [key, value] of Object.entries(proxyEnv ?? {})) {
        if (typeof value === 'string' && value !== '')
            env[key] = value;
    }
    return env;
}
//# sourceMappingURL=agy-cli.js.map