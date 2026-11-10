/** 单条缓存记录；contextWindow 来自实测（usage_update.size），可缺省。 */
interface CachedModelRow {
    id: string;
    name: string;
    description?: string;
    contextWindow?: number;
}
/** 读取观测过的模型目录；任何异常都返回 undefined（调用方降级为占位模型）。 */
export declare function readCachedCatalog(options: {
    cacheDir: string;
    acpVersion: string;
    /** 缓存文件名（默认 catalog.json）；CLI 清单另存一份时用它区分。 */
    fileName?: string;
}): Promise<CachedModelRow[] | undefined>;
/**
 * 写入观测到的模型目录。写入失败（只读缓存目录、磁盘满、文件被占用）静默忽略：
 * 缓存是优化，不是功能，失败不得影响本轮对话。
 */
export declare function writeCachedCatalog(options: {
    cacheDir: string;
    acpVersion: string;
    models: readonly CachedModelRow[];
    /** 缓存文件名（默认 catalog.json）。 */
    fileName?: string;
}): Promise<void>;
export {};
