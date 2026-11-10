/** 默认下载的官方 server 版本（可经 config.acpVersion 配置）。 */
export declare const DEFAULT_ACP_SERVER_VERSION = "1.4.0";
/** 官方 zip 下载的整体超时（含读完响应体）。 */
export declare const DOWNLOAD_TIMEOUT_MS: number;
/** 唯一允许的下载域名。 */
export declare const DOWNLOAD_HOST_WHITELIST = "dl.google.com";
/** 数据缓存（模型清单等**非可执行**产物）在 DSH home 下的相对位置。 */
export declare const CACHE_SUBPATH: readonly ["cache", "antigravity-acp"];
/** 可执行文件安装根目录的目录名。 */
export declare const INSTALL_DIR_NAME = "dsh-antigravity-host";
/**
 * 解压上限（压缩炸弹纵深防御）。
 *
 * 官方 zip 解压后约 200–300MB、条目数十个；给 4 倍余量既不误伤正常包，也挡住
 * 「几 KB 的 zip 解出几十 GB」这类攻击。下载源已限定 https + dl.google.com +
 * 拒绝重定向，因此这一层是纯纵深防御，不是唯一屏障。
 */
export declare const MAX_EXTRACT_ENTRIES = 2000;
export declare const MAX_EXTRACT_BYTES: number;
/** 单个条目上限：官方最大条目就是主程序本身。 */
export declare const MAX_EXTRACT_ENTRY_BYTES: number;
/** 覆盖可执行文件安装根目录的环境变量名。 */
export declare const INSTALL_ROOT_ENV = "AGY_ACP_HOME";
/**
 * 本包原创错误码体系（AGY_*）。与协议层的 AGY_LAUNCH_FAILED 等共用前缀，
 * 便于在日志中区分归属。
 */
export declare const AGY_BINARY_ERROR: {
    /** URL 不满足 https + dl.google.com 白名单。 */
    readonly BLOCKED_URL: "AGY_DOWNLOAD_BLOCKED";
    /** 服务器返回 3xx 重定向；安全策略要求拒绝且不跟随。 */
    readonly REDIRECT_REFUSED: "AGY_DOWNLOAD_REDIRECT_REFUSED";
    /** 下载返回非 2xx（非 3xx）状态。 */
    readonly BAD_STATUS: "AGY_DOWNLOAD_BAD_STATUS";
    /** zip 条目路径不安全（绝对路径、穿越、盘符等）。 */
    readonly UNSAFE_ENTRY: "AGY_UNSAFE_ZIP_ENTRY";
    /** zip 内找不到可执行文件等结构异常。 */
    readonly ARCHIVE_LAYOUT: "AGY_ARCHIVE_LAYOUT";
    /** zip 打开或读取失败。 */
    readonly ARCHIVE_READ: "AGY_ARCHIVE_READ";
    /** zip 条目数或解压后大小超过上限（压缩炸弹防护）。 */
    readonly ARCHIVE_TOO_LARGE: "AGY_ARCHIVE_TOO_LARGE";
    /** 所有解析顺序都未找到二进制且未启用自动下载。 */
    readonly BINARY_MISSING: "AGY_BINARY_MISSING";
    /** 当前平台/架构无法映射出已知的下载坐标。 */
    readonly PLATFORM_UNSUPPORTED: "AGY_PLATFORM_UNSUPPORTED";
    /** 可执行文件落在 Low 强制完整性目录：进程会被降权，官方 server 必然挂死。 */
    readonly LOW_INTEGRITY: "AGY_BINARY_LOW_INTEGRITY";
};
export declare class AgyBinaryError extends Error {
    readonly code: string;
    constructor(code: string, message: string, options?: {
        cause?: unknown;
    });
}
export type AcpPlatform = 'windows' | 'darwin' | 'linux';
export type AcpArch = 'x86_64' | 'aarch64';
/** posix = darwin / linux（可执行文件挑选规则一致）。 */
export type ExecutableFlavor = 'windows' | 'posix';
/** 发行布局取自官方 ACP registry 的 antigravity-acp/agent.json（1.4.1）。
 * 默认版本仍是 1.4.0；该表描述命名与入口，不宣称旧版所有平台均已实机验证。
 */
export declare const ACP_DISTRIBUTIONS: {
    readonly windows: {
        readonly directory: "windows";
        readonly executable: "agy_acp_server.exe";
        readonly defaultArgs: readonly [];
    };
    readonly darwin: {
        readonly directory: "macos";
        readonly executable: "agy_acp_server.par";
        readonly defaultArgs: readonly [];
    };
    readonly linux: {
        readonly directory: "linux";
        readonly executable: "agy_acp_server.par";
        readonly defaultArgs: readonly ["--uid="];
    };
};
export declare function defaultAgentArgs(platform?: NodeJS.Platform): readonly string[];
/** 拼接官方下载 URL，架构命名与本地 Node 架构名称分开处理。 */
export declare function resolveDownloadUrl(platform: AcpPlatform, arch: AcpArch, version?: string): string;
/** 校验下载 URL：仅 https + 白名单域名，其余一律拒绝。 */
export declare function assertDownloadUrl(url: string): URL;
/** downloadBinary 可注入的最小 HTTP 响应形状（结构化，便于测试伪造）。 */
export interface HttpResponseLike {
    ok: boolean;
    status: number;
    arrayBuffer(): Promise<ArrayBuffer>;
    body?: unknown;
}
export type FetchLike = (url: string, init: {
    redirect: 'manual';
    signal?: AbortSignal;
}) => Promise<HttpResponseLike>;
/**
 * 下载二进制到内存。redirect 显式设为 'manual'，任何 3xx 都视为错误——
 * 官方分发应直链；重定向意味着 URL 失效或被劫持，不跟随。
 */
export declare function downloadBinary(url: string, options?: {
    fetchImpl?: FetchLike;
    signal?: AbortSignal;
    timeoutMs?: number;
}): Promise<Uint8Array>;
/**
 * 流式下载二进制并直接写入指定文件路径。
 * 若 response.body 提供可读流则以管道直写，避免将 ~100MB 的 zip 整包载入 V8 堆内存；
 * 若未提供流（如测试用 arrayBuffer 替身）则回退到 arrayBuffer 写入。
 */
export declare function downloadBinaryToFile(url: string, destPath: string, options?: {
    fetchImpl?: FetchLike;
    signal?: AbortSignal;
    timeoutMs?: number;
}): Promise<void>;
/**
 * 校验单个 zip 条目路径，返回规范化的 POSIX 相对路径（目录条目保留尾随 `/`）。
 *
 * 拒绝：空路径、反斜杠分隔、绝对路径、Windows 盘符、`.`/`..` 段、中间空段。
 * 放行：以 `/` 结尾的**目录条目**（`dir/`、`dir/sub/`）——它们是合法的 zip
 * 布局（yauzl 的 validateFileName 同样接受），其尾随斜杠只是「这是目录」的
 * 标记，不构成路径穿越或绝对路径；解压时按目录创建。
 */
export declare function validateZipEntryPath(entryName: string): string;
/**
 * 从已校验的相对条目列表里挑出 ACP server 可执行文件。
 * 优先只接受官方入口名，兼容旧版 hyphen 拼写。挑选必须确定性：取路径深度最小、
 * 同深度取字典序最小。找不到抛 AGY_ARCHIVE_LAYOUT。
 */
export declare function pickExecutablePath(entries: readonly string[], flavor: ExecutableFlavor): string;
/** 解压目标子目录名（限定在版本缓存目录内）。 */
export declare function extractDirName(version: string): string;
/**
 * 解析缓存根目录（**只放数据，不放可执行文件**）。优先 $DSH_HOME（宿主注入的
 * 环境变量）；缺失时回退到用户 home 下的 `.dsh`（与 DSH 默认 home 布局一致，
 * 注释性回退而非承诺）；两者都不可用则退到系统临时目录，保证本插件在无
 * DSH_HOME 的开发环境也能运行。
 *
 * 注意：目录树可能带 Low 强制完整性标签，因此**可执行文件绝不能装在这里**，
 * 见 {@link resolveInstallRoot}。
 */
export declare function resolveCacheDir(env?: Readonly<Record<string, string | undefined>>, homedir?: () => string): string;
/**
 * 解析**可执行文件**安装根目录——刻意不放在 `$DSH_HOME` 之下。
 *
 * ## 为什么必须离开 DSH home
 *
 * DSH 把 `$DSH_HOME`（默认 `~/.dsh`）整棵树显式标成 **Low 强制完整性**
 * （`icacls` 可见 `Mandatory Label\Low Mandatory Level:(OI)(CI)(NW)`，属沙箱地基），
 * 新建文件一律继承该标签；而 Windows 在创建进程时**会采用映像文件的强制完整性
 * 标签**。于是装在 `~/.dsh` 下的官方 exe 只能以 LOW 运行，受 MIC「禁止向上写」
 * 约束，写不进中等完整性的 `~/.gemini/antigravity-acp/`——官方 server 保存凭据用的
 * `tempfile.NamedTemporaryFile` 会因此在 `PermissionError` 上无限重试，
 * `session/new` 永不返回（2026-10-16 实测定位，详见 `integrity.ts`）。
 *
 * 因此安装根默认取用户级应用数据目录（Windows: `%LOCALAPPDATA%`；
 * POSIX: `$XDG_CACHE_HOME` 或 `~/.cache`），它们不在 Low 标签树内。
 * 可用 `AGY_ACP_HOME` 或配置项 `binaryPath` 覆盖。
 */
export declare function resolveInstallRoot(env?: Readonly<Record<string, string | undefined>>, platform?: NodeJS.Platform, homedir?: () => string): string;
/** 版本缓存目录与其解压子目录。 */
export declare function versionCachePaths(cacheDir: string, version: string): {
    versionDir: string;
    extractDir: string;
};
/** 运行代码与可执行文件同属用户级安装根，禁止放回 Low 标签的数据缓存树。 */
export declare function resolveRuntimeRoot(env?: Readonly<Record<string, string | undefined>>, platform?: NodeJS.Platform, homedir?: () => string): string;
export interface RuntimeDirectory {
    path: string;
    root: string;
    ownerId: string;
}
export type RuntimeDirectoryLease = RuntimeDirectory;
export type ProcessLiveness = (pid: number) => boolean | undefined | Promise<boolean | undefined>;
/** 只把 ESRCH 视为死亡；权限不足、PID 复用或任何未知状态均保留文件。 */
export declare function isProcessAlive(pid: number): boolean | undefined;
/** 创建一次启动独占的目录。调用方需在 spawn 前检查 Windows 完整性标签。 */
export declare function createRuntimeDirectory(options?: {
    root?: string;
    ownerPid?: number;
}): Promise<RuntimeDirectory>;
/** 仅在关联子进程已确认退出后调用；ownerId 防止清除后来替换的目录。 */
export declare function releaseRuntimeDirectory(lease: RuntimeDirectory): Promise<void>;
/** 仅重试已经明确记录子进程退出的目录。宿主死亡不代表其所有后代已停止。 */
export declare function cleanupStaleRuntimeDirectories(root?: string): Promise<number>;
/** PyInstaller onefile 的解压目录前缀。 */
export declare const PYI_TEMP_PREFIX = "_MEI";
/** 旧 API 保留的常量；不再用年龄判断运行目录能否安全删除。 */
export declare const PYI_TEMP_MAX_AGE_MS = 3600000;
/**
 * @deprecated 旧版共享 _MEI 无所有权记录，不能安全自动清理。
 * 新运行目录通过 cleanupStaleRuntimeDirectories 清理。
 */
export declare function cleanupStalePyiTempDirs(_dir: string, _options?: {
    maxAgeMs?: number;
    now?: () => number;
}): Promise<number>;
/** 下载解压暂存目录前缀。 */
export declare const STAGING_DIR_PREFIX = ".staging-";
/** 判定暂存目录「陈旧」的默认阈值（1 小时）。 */
export declare const STAGING_MAX_AGE_MS = 3600000;
/**
 * 清理下载或解压过程中因强杀/异常中断而残留的陈旧 `.staging-*` 目录。
 * 遍历指定目录自身及其直接子目录（如 `<installRoot>/<version>/.staging-*`）。
 * 仅删除有所有权记录、宿主 PID 已确认死亡且 mtime 超过阈值的目录。
 * 旧版未记录 owner 的目录保留，避免干扰仍在执行的安装。
 */
export declare function cleanupStaleStagingDirs(dir: string, options?: {
    maxAgeMs?: number;
    now?: () => number;
    isProcessAlive?: ProcessLiveness;
}): Promise<number>;
/**
 * Node 的 process.platform / process.arch → 下载坐标映射。
 * 未映射组合抛 AGY_PLATFORM_UNSUPPORTED（用户可用 binaryPath/AGY_ACP_BIN
 * 或 AGY_ACP_URL 覆盖，而不是让我们猜测 URL）。
 */
export declare function mapNodePlatform(platform: NodeJS.Platform, arch: string): {
    platform: AcpPlatform;
    arch: AcpArch;
};
/** posix 解压产物补执行位。 */
export declare function ensureExecutable(file: string, flavor: ExecutableFlavor): Promise<void>;
/** 解压上限；默认取文件顶部常量，测试可注入小值验证守卫本身。 */
export interface ExtractLimits {
    maxEntries?: number;
    maxTotalBytes?: number;
    maxEntryBytes?: number;
}
/** 用 yauzl 把 zip 安全解到 destDir；返回全部已校验的相对条目路径。 */
export declare function extractZipSafely(zipPath: string, destDir: string, limits?: ExtractLimits): Promise<readonly string[]>;
export interface AgentBinaryResolution {
    /** 可直接交给 ctx.subprocess 的可执行文件路径。 */
    executablePath: string;
    /** 命中来源：手动配置 / 环境变量 / 缓存 / 自动下载。 */
    source: 'config' | 'env' | 'cache' | 'download';
    /** 下载缓存中的版本号（手动路径时为 undefined）。 */
    version?: string;
    /** 官方未提供校验和，这里永远如实为 false，不得伪造为 true。 */
    checksumVerified: false;
}
export interface AgentBinaryOptions {
    /** 用户显式配置的二进制路径，最高优先级。 */
    binaryPath?: string;
    /** 是否允许自动下载（默认 true）。 */
    autoDownload?: boolean;
    /** 目标版本（默认 1.4.0）。 */
    version?: string;
    /** 下载 URL 覆盖（未验证平台组合的逃生门；仍受域名白名单约束）。 */
    downloadUrl?: string;
    fetchImpl?: FetchLike;
    signal?: AbortSignal;
    env?: Readonly<Record<string, string | undefined>>;
    /** 安装根目录覆盖；默认 {@link resolveInstallRoot}（**不是** DSH home）。 */
    cacheDir?: string;
    /** 平台覆写供离线发行表测试；正常调用使用 process.platform/arch。 */
    platform?: NodeJS.Platform;
    arch?: string;
}
/**
 * 完整解析顺序。下载阶段：先落 `<versionDir>/agy-acp-server.zip.tmp`，
 * 成功后原子重命名，失败清理临时残留；解压先在临时目录进行，全部成功
 * 后重命名进 extract 目录，保证缓存状态始终自洽。
 */
export declare function ensureAgentBinary(options?: AgentBinaryOptions): Promise<AgentBinaryResolution>;
