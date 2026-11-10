/** 单条会话映射；字段语义变化时提升 SESSION_MAP_FORMAT。 */
export interface SessionMapEntry {
    /** ACP 会话 id（官方 agent 分配）。 */
    sessionId: string;
    /** 建立会话时的 cwd（`session/load` 需要）。 */
    cwd: string;
    /** 已发送给该 ACP 会话的 DSH 消息条数。 */
    sentCount: number;
    /** 前 sentCount 条消息的滚动指纹（sha256 hex）。 */
    sentHash: string;
    /** 上一步实际交付的 assistant blocks 指纹；恢复时必须与 DSH 新增历史一致。 */
    outputHash: string;
    /** 路由指纹：模型、思考强度、系统提示与工具目录。 */
    route: string;
    /** 最近一次成功发送的时间（毫秒）。 */
    updatedAt: number;
}
/** 读取会话映射；任何异常都返回空表（调用方回退重建）。 */
export declare function readSessionMap(cacheDir: string): Promise<Record<string, SessionMapEntry>>;
/**
 * 写入会话映射。写入失败（只读缓存目录、磁盘满、文件被占用）静默忽略：
 * 恢复能力是优化，不是功能。
 */
export declare function writeSessionMap(cacheDir: string, entries: Record<string, SessionMapEntry>): Promise<boolean>;
/**
 * 跨 Host 的排他写租约；另一实例持有缓存时，本实例仅保留内存复用，不读写恢复映射。
 * 不按 mtime 猜测锁过期：崩溃残留锁需在确认所有 Host 已退出后人工清理。
 */
export declare function createFileSessionMapStore(cacheDir: string, onError?: () => void): SessionMapStore;
export interface SessionMapStorage {
    load(): Promise<Record<string, SessionMapEntry>>;
    save(entries: Record<string, SessionMapEntry>): Promise<void> | void;
    onError?(): void;
    close?(): Promise<void>;
}
/**
 * 同一插件的所有 worker 共用一个存储：键的所有权与增量更新集中管理，写入串行化。
 * 接管仍被另一 worker 持有的键时不 load 旧 ACP 会话（它仍可能在旧进程内存中）。
 * 每次只更新调用方本轮的键，旧 worker 无法覆盖或删除新 owner 的状态。
 */
export declare class SessionMapStore {
    #private;
    private readonly storage;
    constructor(storage: SessionMapStorage);
    claim(key: string, owner: symbol): Promise<SessionMapEntry | undefined>;
    owns(key: string, owner: symbol): boolean;
    set(key: string, owner: symbol, entry: SessionMapEntry): void;
    delete(key: string, owner: symbol): void;
    /**
     * 只归还单个键的所有权，保留可恢复条目。
     *
     * 用于「认领了但这一轮没能走到 prompt 在途」的失败路径：条目本身没被否定
     * （例如恢复只是启动失败），下一个 worker 仍可以尝试接管它。
     */
    unclaim(key: string, owner: symbol): void;
    /** 卸载释放内存所有权但保留可恢复条目。 */
    release(owner: symbol): void;
    flush(): Promise<void>;
    close(): Promise<void>;
}
