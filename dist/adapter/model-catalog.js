function isSelect(option) {
    return option.type === 'select';
}
/**
 * 展平 ACP 的两层 options：既有扁平的 SessionConfigSelectOption[]，也有
 * 带分组的 SessionConfigSelectGroup[]；分组按声明顺序展开为值序列。
 */
export function flattenSelectOptions(options) {
    if (!Array.isArray(options) || options.length === 0)
        return [];
    const first = options[0];
    if (!first)
        return [];
    if ('group' in first) {
        const flattened = [];
        for (const group of options) {
            for (const option of group.options)
                flattened.push(option);
        }
        return flattened;
    }
    return [...options];
}
/**
 * 从 configOptions 中找出模型选择器。
 *
 * 判定顺序：显式 `category === "model"` 优先（ACP 规范为此保留了语义标签）；
 * 没有标签时退回「select 且 id/name 含 model」的启发式。都不匹配则返回
 * undefined——调用方据此走「无可选模型」的显式失败，而不是随便挑一个 select。
 */
export function findModelSelector(configOptions) {
    if (!configOptions?.length)
        return undefined;
    const selects = configOptions.filter(isSelect);
    const tagged = selects.find((option) => option.category === 'model');
    const picked = tagged ?? selects.find((option) => /model/i.test(option.id) || /model/i.test(option.name));
    if (!picked)
        return undefined;
    const selector = {
        configId: picked.id,
        options: flattenSelectOptions(picked.options),
    };
    return picked.currentValue === undefined ? selector : { ...selector, currentValue: picked.currentValue };
}
/**
 * 把模型选择器的可选值映射为 DSH 模型目录。
 *
 * id 取 ACP 的 option value（随后作为 `GenerateOptions.model` 原样送回，
 * 并在 `session/set_config_option` 中作为该 configId 的取值），name 取
 * ACP 的 label；ACP 未提供描述时不编造描述。
 */
export function toModelCatalog(provider, selector) {
    if (!selector)
        return [];
    return selector.options.map((option) => {
        const description = option.description ?? undefined;
        const entry = {
            provider,
            id: option.value,
            name: option.name,
            inputModalities: ['text'],
        };
        return description === undefined ? entry : { ...entry, description };
    });
}
//# sourceMappingURL=model-catalog.js.map