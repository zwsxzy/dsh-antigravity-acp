/**
 * 插件配置接口与 schemastery Schema。
 * schema 写法对准已安装 @deepseek-ai/schemastery 3.18.x 的实际导出。
 */
import Schema from '@deepseek-ai/schemastery';
import { DEFAULT_ACP_SERVER_VERSION } from './runtime/binary.js';
// Only fields owned by the custom settings card are live. Ordinary launch/pool
// configuration remains ordinary, so editing it still follows the host lifecycle.
export const LIVE_SETTING_KEYS = ['autoWarmup', 'reuseSessions', 'modelOverrides', 'proxyUrl', 'proxyBypass', 'agyCliPath', 'resumeSessions', 'keepProcessAfterCancel', 'cancelGraceMs', 'idleRecycleMs', 'proxyMode', 'cliQuotaEnabled'];
function readSetting(value) {
    return typeof value === 'object' && value !== null && 'get' in value ? value.get() : value;
}
/** Keep references live; callers may spread this view to capture one operation. */
export function liveHostConfig(config) {
    return {
        ...config,
        get autoWarmup() { return readSetting(config.autoWarmup); },
        get reuseSessions() { return readSetting(config.reuseSessions); },
        get modelOverrides() { return readSetting(config.modelOverrides); },
        get proxyUrl() { return readSetting(config.proxyUrl); },
        get proxyBypass() { return readSetting(config.proxyBypass); },
        get agyCliPath() { return readSetting(config.agyCliPath); },
        get resumeSessions() { return readSetting(config.resumeSessions); },
        get keepProcessAfterCancel() { return readSetting(config.keepProcessAfterCancel); },
        get cancelGraceMs() { return readSetting(config.cancelGraceMs); },
        get idleRecycleMs() { return readSetting(config.idleRecycleMs); },
        get proxyMode() { return readSetting(config.proxyMode); },
        get cliQuotaEnabled() { return readSetting(config.cliQuotaEnabled); },
    };
}
/** 官方思考档位；与 runtime/agy-cli.ts 的 AGY_REASONING_EFFORTS 一致。 */
export const MODEL_EFFORTS = ['low', 'medium', 'high'];
/**
 * modelOverrides 的 schema。
 *
 * TS2742 规避：`Schema.dict` 的推断类型引用 schemastery 依赖的 cosmokit
 * `Dict`；npm ci 在版本分叉时会把 cosmokit 嵌套进
 * `@deepseek-ai/schemastery/node_modules`，导出类型无法命名该路径（本机
 * 扁平提升才看不出来）。末尾的显式标注把 Config 的类型收敛到本包
 * `ModelOverride`，只经过可移植路径。
 */
const ModelOverrideSchema = Schema.object({
    enabled: Schema.boolean().default(true).description('是否出现在 DSH 模型选择器'),
    effort: Schema.union(MODEL_EFFORTS).description('默认思考档位：low / medium / high'),
    name: Schema.string().description('显示名覆盖'),
    target: Schema.string().description('映射到的官方模型 ID，优先于家族 + 档位路由'),
});
export const Config = Schema.object({
    maxConcurrentSessions: Schema.natural().min(1).max(4).default(2).description('最大并发 ACP 连接数（1–4），按需启动；不同对话互不占用工具审批回合'),
    queueTimeoutMs: Schema.natural().min(1000).default(120000).description('等待空闲 ACP 连接的最长时间（毫秒），排队期间可取消'),
    agyCliPath: Schema.string().volatile().description('官方 agy CLI 路径；留空依次查 AGY_CLI_BIN、PATH 和默认安装目录'),
    autoWarmup: Schema.boolean().default(true).volatile().description('插件启用时预热并保留 ACP 连接，减少首次聊天启动等待；复用本机登录态，不发送模型消息'),
    binaryPath: Schema.string().description('官方 agy-acp-server 可执行文件路径；留空则按 AGY_ACP_BIN → 缓存 → 自动下载解析'),
    autoDownload: Schema.boolean().default(true).description('未找到本地二进制时自动从 dl.google.com 下载（仅 https + 官方域名 + 拒绝重定向）'),
    extraArgs: Schema.array(Schema.string()).default([]).description('传给 ACP server 的额外命令行参数'),
    acpVersion: Schema.string().default(DEFAULT_ACP_SERVER_VERSION).description('自动下载的 ACP server 版本'),
    requestTimeoutMs: Schema.natural().default(30_000).description('单个 ACP 请求默认超时（毫秒）'),
    handshakeTimeoutMs: Schema.natural().min(1000).default(120_000).description('initialize 握手等待上限（毫秒）；官方进程冷启动（解压、杀软扫描）可能超过 1 分钟'),
    authTimeoutMs: Schema.natural().default(300_000).description('authenticate（需人工在浏览器完成 OAuth 授权）的等待上限（毫秒）'),
    promptTimeoutMs: Schema.natural().default(1_800_000).description('单轮 session/prompt 的等待上限（毫秒）'),
    bridgeParkSettleMs: Schema.natural().default(50).description('并发 MCP tools/call 的聚合窗口（毫秒）'),
    modelOverrides: Schema.dict(ModelOverrideSchema).default({}).volatile().description('按模型 ID 的目录设置（是否显示、默认思考档位、显示名、官方模型 ID 映射）；只作用于目录中已存在的模型'),
    proxyUrl: Schema.string().volatile().description('官方进程出网代理，如 http://127.0.0.1:7890（缺 scheme 按 http 处理）。留空继承宿主代理，宿主也未配置时才直连'),
    proxyBypass: Schema.string().volatile().description('代理排除列表，逗号分隔，如 example.internal,*.internal；不支持 CIDR。localhost/127.0.0.1/::1 始终自动排除'),
    reuseSessions: Schema.boolean().default(true).volatile().description('复用同一个 ACP 会话，后续回合只发送新增消息；历史被压缩/回退或模型、工具目录变化时自动重建。关闭则每轮新会话并重放全部历史'),
    resumeSessions: Schema.boolean().default(false).volatile().description('重启后尝试用 session/load 恢复上次的 ACP 会话；依赖 agent 的 loadSession 能力，恢复失败会自动重建'),
    keepProcessAfterCancel: Schema.boolean().default(false).volatile().description('用户取消后保留官方进程：宽限内确认 agent 已停止就只丢弃会话，下一轮不必冷启动；默认关闭'),
    cancelGraceMs: Schema.natural().max(60_000).default(30_000).volatile().description('取消后等待 agent 确认停止的上限（毫秒）；0 表示不等待、立即回收'),
    idleRecycleMs: Schema.natural().max(3_600_000).default(300_000).volatile().description('保留进程的最长空闲时间（毫秒），超时回收；0 表示不设上限。默认 5 分钟是本插件的资源回收策略，不代表上游缓存 TTL'),
    proxyMode: Schema.boolean().default(false).volatile().description('代理模式（默认关闭）：开启后模型生成改由本 bundle 的代理路由直连上游（自有 OAuth 登录态 + agy 线身份），并停用官方 ACP 路由；关闭恢复 ACP 模式'),
    cliQuotaEnabled: Schema.boolean().default(false).volatile().description('允许额度取数调用本机 agy CLI（默认关闭）。关闭时不启动 agy，套餐额度走内置直连，AI Credits 不查询。开启后 ACP 模式运行 agy -p /usage 与 agy -p /credits；代理模式套餐额度仍用代理账户，仅 AI Credits 调用 agy -p /credits'),
});
//# sourceMappingURL=settings.js.map