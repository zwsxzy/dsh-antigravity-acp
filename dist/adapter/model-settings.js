const EFFORTS = ['low', 'medium', 'high'];
function isEffort(value) {
    return typeof value === 'string' && EFFORTS.includes(value);
}
function text(value) {
    return typeof value === 'string' ? value.trim() : '';
}
/**
 * 把配置里的原始记录收敛成可用设置：非法档位、空串与非对象条目一律丢弃，
 * 不让一份手写配置让整个目录失败。
 */
export function normalizeModelSettings(input) {
    const settings = new Map();
    if (!input || typeof input !== 'object' || Array.isArray(input))
        return settings;
    for (const [rawId, row] of Object.entries(input)) {
        const id = text(rawId);
        if (!id || !row || typeof row !== 'object' || Array.isArray(row))
            continue;
        const record = row;
        const name = text(record.name);
        const target = text(record.target);
        settings.set(id, {
            enabled: record.enabled !== false,
            ...(isEffort(record.effort) ? { effort: record.effort } : {}),
            ...(name === '' ? {} : { name }),
            ...(target === '' ? {} : { target }),
        });
    }
    return settings;
}
/** 该模型的显示设置；未配置时返回启用且不带覆盖项。 */
export function modelSettingFor(settings, id) {
    return settings.get(id) ?? { enabled: true };
}
/** 是否列入 DSH 模型选择器。 */
export function modelVisible(settings, id) {
    return modelSettingFor(settings, id).enabled;
}
/**
 * 应用显示名覆盖；停用不影响调用，因此本函数只处理名称，不做过滤。
 */
export function modelDisplayName(settings, id, fallback) {
    const name = modelSettingFor(settings, id).name;
    return name === undefined ? fallback : name;
}
/**
 * 决定写入 ACP 的官方模型 ID。
 *
 * 顺序：显式 `target` 映射 → 家族 + 档位路由（`route` 回调）。
 * 档位取「本次显式选择」优先，其次该模型的默认档位，最后交给路由回调决定默认。
 */
export function resolveModelTarget(options) {
    const setting = modelSettingFor(options.settings, options.model);
    if (setting.target !== undefined)
        return setting.target;
    return options.route(options.effort ?? setting.effort);
}
/**
 * 折叠后的目录条目套用用户设置：显示名覆盖 + 隐藏停用项。
 *
 * 停用的条目仍然参与家族档位折叠（在调用方完成），这里只决定最终列表。
 */
export function applyModelSettings(settings, rows) {
    const result = [];
    for (const row of rows) {
        const setting = modelSettingFor(settings, row.id);
        if (!setting.enabled)
            continue;
        result.push(setting.name === undefined ? row : { ...row, name: setting.name });
    }
    return result;
}
//# sourceMappingURL=model-settings.js.map