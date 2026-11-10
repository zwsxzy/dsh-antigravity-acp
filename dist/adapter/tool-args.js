const MAX_ENUM_VALUES = 6;
const MAX_UNION_PARTS = 4;
function record(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value
        : undefined;
}
function requiredKeys(parameters) {
    const required = record(parameters)?.required;
    return Array.isArray(required) ? required.filter((key) => typeof key === 'string') : [];
}
/** 把一个属性 schema 渲染成短类型串；无法识别时退化为 `any`。 */
function renderType(schema, depth = 0) {
    const node = record(schema);
    if (!node)
        return 'any';
    if (Array.isArray(node.enum) && node.enum.length > 0) {
        const values = node.enum.slice(0, MAX_ENUM_VALUES).map((value) => JSON.stringify(value));
        return node.enum.length > MAX_ENUM_VALUES ? `${values.join('|')}|…` : values.join('|');
    }
    if (node.const !== undefined)
        return JSON.stringify(node.const);
    for (const key of ['anyOf', 'oneOf']) {
        const parts = node[key];
        if (Array.isArray(parts) && parts.length > 0 && depth < 2) {
            return parts.slice(0, MAX_UNION_PARTS).map((part) => renderType(part, depth + 1)).join('|');
        }
    }
    const type = node.type;
    if (Array.isArray(type))
        return type.filter((item) => typeof item === 'string').join('|') || 'any';
    if (type === 'array')
        return depth < 2 ? `${renderType(node.items, depth + 1)}[]` : 'array';
    if (typeof type === 'string')
        return type;
    return 'any';
}
/** `read(file_path: string, offset?: number, limit?: number)`；必填在前，可选带 `?`。 */
export function renderToolSignature(tool) {
    const parameters = record(tool.parameters);
    const properties = record(parameters?.properties) ?? {};
    const required = new Set(requiredKeys(parameters));
    const names = Object.keys(properties);
    // 必填项按 `required` 声明顺序在前（DSH 工具常要求特定的参数出现顺序），可选项按声明顺序在后。
    const ordered = [
        ...requiredKeys(parameters).filter((name, index, all) => all.indexOf(name) === index),
        ...names.filter((name) => !required.has(name)),
    ];
    const parts = ordered.map((name) => `${name}${required.has(name) ? '' : '?'}: ${renderType(properties[name])}`);
    return `${tool.name}(${parts.join(', ')})`;
}
/** 整个目录的签名块正文；空目录返回 undefined（不产生块）。 */
export function renderToolSignatures(tools) {
    if (tools.length === 0)
        return undefined;
    return [
        '随会话工具的参数签名（调用时参数名必须与此逐字一致）：',
        '- 不带 ? 的参数是必填项，不得省略；带 ? 的是可选项。',
        '- 不要沿用 agy 原生工具的参数名（如 path / AbsolutePath / CommandLine），也不要自造别名。',
        '- 调用前先对照签名补齐全部必填参数；说明类必填参数（如 description）也必须提供。',
        ...tools.map((tool) => `- ${renderToolSignature(tool)}`),
    ].join('\n');
}
/**
 * 对照 schema 检查一次调用的参数键。只看 `required` 与 `properties`，不检查类型、
 * 取值或 `additionalProperties`，因此不会拒绝 DSH 自己会接受的调用。
 */
export function inspectToolArguments(tool, args) {
    const input = record(args) ?? {};
    const properties = record(record(tool.parameters)?.properties);
    const missing = requiredKeys(tool.parameters).filter((key) => !Object.hasOwn(input, key) || input[key] === undefined);
    const unknown = properties
        ? Object.keys(input).filter((key) => !Object.hasOwn(properties, key))
        : [];
    return { missing: [...new Set(missing)], unknown };
}
// 不换算单位、不猜测字段内容；例如 timeout 和 timeoutMs 绝不能按别名处理。
const ARGUMENT_ALIASES = [
    ['file_path', 'path', 'absolute_path', 'AbsolutePath', 'target_file', 'TargetFile'],
    ['command', 'command_line', 'CommandLine'],
    ['cwd', 'working_directory', 'working_dir', 'Cwd'],
    ['description', 'Description'],
];
/** 仅当 schema 中目标唯一、输入中来源唯一且目标缺失时，修正常见的字符串参数名。 */
export function normalizeToolArguments(tool, args) {
    const input = { ...record(args) };
    const properties = record(record(tool.parameters)?.properties) ?? {};
    const renamed = [];
    for (const group of ARGUMENT_ALIASES) {
        const targets = group.filter((key) => Object.hasOwn(properties, key));
        if (targets.length !== 1)
            continue;
        const target = targets[0];
        if (Object.hasOwn(input, target))
            continue;
        const sources = group.filter((key) => !Object.hasOwn(properties, key) && Object.hasOwn(input, key));
        if (sources.length !== 1)
            continue;
        const source = sources[0];
        // 这些别名只对字符串字段有确定含义，其他 schema 形状交给原校验路径。
        if (record(properties[target])?.type !== 'string' || typeof input[source] !== 'string')
            continue;
        input[target] = input[source];
        delete input[source];
        renamed.push({ from: source, to: target });
    }
    return { arguments: input, renamed };
}
/** 键名只有形如标识符且不过长时才可进日志/错误文案（模型可控字符串不原样回显）。 */
export function safeKeyNames(keys, limit = 8) {
    return keys.filter((key) => /^[A-Za-z_][\w.-]{0,39}$/.test(key)).slice(0, limit);
}
//# sourceMappingURL=tool-args.js.map