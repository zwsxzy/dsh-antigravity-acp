/** 与 runtime/agy-cli.ts 的档位顺序一致（弱 → 强）。 */
export type ModelEffort = 'low' | 'medium' | 'high';
export interface ModelSetting {
    enabled: boolean;
    effort?: ModelEffort;
    name?: string;
    target?: string;
}
/**
 * 把配置里的原始记录收敛成可用设置：非法档位、空串与非对象条目一律丢弃，
 * 不让一份手写配置让整个目录失败。
 */
export declare function normalizeModelSettings(input: unknown): Map<string, ModelSetting>;
/** 该模型的显示设置；未配置时返回启用且不带覆盖项。 */
export declare function modelSettingFor(settings: ReadonlyMap<string, ModelSetting>, id: string): ModelSetting;
/** 是否列入 DSH 模型选择器。 */
export declare function modelVisible(settings: ReadonlyMap<string, ModelSetting>, id: string): boolean;
/**
 * 应用显示名覆盖；停用不影响调用，因此本函数只处理名称，不做过滤。
 */
export declare function modelDisplayName(settings: ReadonlyMap<string, ModelSetting>, id: string, fallback: string): string;
/**
 * 决定写入 ACP 的官方模型 ID。
 *
 * 顺序：显式 `target` 映射 → 家族 + 档位路由（`route` 回调）。
 * 档位取「本次显式选择」优先，其次该模型的默认档位，最后交给路由回调决定默认。
 */
export declare function resolveModelTarget(options: {
    settings: ReadonlyMap<string, ModelSetting>;
    /** DSH 请求里的路由键（家族 id 或完整档位 id）。 */
    model: string;
    /** 本次显式选择的思考强度；未选择时为 undefined。 */
    effort?: ModelEffort;
    /** 未给出映射与档位时的官方路由结果。 */
    route(tier: ModelEffort | undefined): string;
}): string;
/** 模型条目的原始记录（目录观测或 CLI 清单）；只保留需要的字段。 */
export interface CatalogRow {
    id: string;
    name: string;
    description?: string;
}
/**
 * 折叠后的目录条目套用用户设置：显示名覆盖 + 隐藏停用项。
 *
 * 停用的条目仍然参与家族档位折叠（在调用方完成），这里只决定最终列表。
 */
export declare function applyModelSettings(settings: ReadonlyMap<string, ModelSetting>, rows: readonly CatalogRow[]): CatalogRow[];
