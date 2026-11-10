export const PROXY_REPLAY_VERSION = 1;
export const PROXY_PROVIDER_ID = 'antigravity-proxy';
export const PROXY_MAX_SIGNATURE_LENGTH = 16 * 1024;
const MAX_BLOCKS = 128;
export function proxyModelFamily(model) {
    const value = model.toLowerCase();
    if (value.includes('gemini'))
        return 'gemini';
    if (value.includes('claude'))
        return 'claude';
    if (value.includes('gpt-oss'))
        return 'gpt-oss';
    return 'unknown';
}
export function createProxyReplayState(model, family, finish, blocks, wireModel) {
    const boundedBlocks = blocks.slice(0, MAX_BLOCKS).map((block) => {
        const signature = safeSignature(block.signature);
        return { kind: block.kind, ...(signature === undefined ? {} : { signature }) };
    });
    const boundedFinish = safeFinish(finish);
    return {
        response: {
            version: PROXY_REPLAY_VERSION,
            provider: PROXY_PROVIDER_ID,
            model: model.slice(0, 256),
            family,
            ...(wireModel === undefined ? {} : { wireModel }),
            ...(boundedFinish === undefined ? {} : { finish: boundedFinish }),
        },
        blocks: boundedBlocks,
    };
}
/** 校验历史消息上的 replay 元数据；不兼容返回 undefined（按无签名重放）。 */
export function compatibleProxyReplayState(message, model, blockKinds, wireModel) {
    if (message.role !== 'assistant')
        return undefined;
    const provenance = isRecord(message.source) ? message.source : undefined;
    if (provenance !== undefined && provenance.kind === 'model' && (provenance.provider !== PROXY_PROVIDER_ID || provenance.model !== model))
        return undefined;
    const value = isRecord(provenance?.replayState)
        ? provenance.replayState
        : isRecord(message.replayState)
            ? message.replayState
            : undefined;
    if (!isRecord(value) || !isRecord(value.response) || !Array.isArray(value.blocks))
        return undefined;
    const family = value.response.family;
    if (value.response.version !== PROXY_REPLAY_VERSION
        || value.response.provider !== PROXY_PROVIDER_ID
        || value.response.model !== model
        || (wireModel !== undefined && value.response.wireModel !== undefined && value.response.wireModel !== wireModel)
        || !isFamily(family)
        || value.blocks.length > MAX_BLOCKS)
        return undefined;
    const blocks = [];
    for (const item of value.blocks) {
        if (!isRecord(item) || typeof item.kind !== 'string')
            continue;
        const kind = item.kind;
        const signature = typeof item.signature === 'string' && safeSignature(item.signature) !== undefined ? item.signature : undefined;
        blocks.push({ kind, ...(signature === undefined ? {} : { signature }) });
    }
    if (blockKinds !== undefined
        && (blocks.length !== blockKinds.length || blocks.some((block, index) => block.kind !== blockKinds[index])))
        return undefined;
    const finish = value.response.finish === undefined ? undefined : safeFinish(value.response.finish);
    if (value.response.finish !== undefined && finish === undefined)
        return undefined;
    return {
        response: {
            version: PROXY_REPLAY_VERSION,
            provider: PROXY_PROVIDER_ID,
            model,
            family,
            ...(typeof value.response.wireModel === 'string' ? { wireModel: value.response.wireModel } : {}),
            ...(finish === undefined ? {} : { finish }),
        },
        blocks,
    };
}
/** DSH 工具 schema → 上游 functionDeclarations 子集（有界、可序列化）。 */
export function buildProxyFunctionDeclarations(tools) {
    if (tools === undefined)
        return [];
    return [...tools].slice(0, 384).map((tool) => ({
        name: boundedName(tool.name),
        description: boundedText(tool.description, 4096),
        parameters: sanitizeSchema(tool.parameters),
    }));
}
// ---------------------------------------------------------------- internals
const ALLOWED_SCHEMA_TYPES = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null']);
function isNullBranch(branch) {
    if (!isRecord(branch))
        return false;
    const type = typeof branch.type === 'string' ? branch.type.toLowerCase() : undefined;
    return type === 'null' || (type === undefined && branch.const === null);
}
function sanitizeSchema(value, depth = 0) {
    if (depth > 8 || !isRecord(value))
        return { type: 'object', properties: {} };
    let source = value;
    if (Array.isArray(source.allOf) && source.allOf.length > 0) {
        const mergedProps = isRecord(source.properties) ? { ...source.properties } : {};
        const mergedReq = new Set(Array.isArray(source.required) ? source.required.filter((item) => typeof item === 'string') : []);
        for (const branch of source.allOf.slice(0, 8)) {
            if (!isRecord(branch))
                continue;
            if (isRecord(branch.properties))
                Object.assign(mergedProps, branch.properties);
            if (Array.isArray(branch.required))
                for (const req of branch.required)
                    if (typeof req === 'string')
                        mergedReq.add(req);
        }
        source = { ...source, type: 'object', properties: mergedProps, ...(mergedReq.size > 0 ? { required: [...mergedReq] } : {}) };
    }
    const rawUnion = Array.isArray(source.anyOf) && source.anyOf.length > 0 ? source.anyOf : Array.isArray(source.oneOf) && source.oneOf.length > 0 ? source.oneOf : undefined;
    if (rawUnion !== undefined) {
        const nonNull = rawUnion.filter((branch) => !isNullBranch(branch));
        const hadNull = nonNull.length < rawUnion.length;
        if (nonNull.length === 1 && isRecord(nonNull[0])) {
            const collapsed = sanitizeSchema({
                ...(typeof source.description === 'string' ? { description: source.description } : {}),
                ...nonNull[0],
            }, depth + 1);
            if (hadNull)
                collapsed.nullable = true;
            return collapsed;
        }
        const branches = (nonNull.length > 0 ? nonNull : rawUnion).slice(0, 8).map((item) => sanitizeSchema(item, depth + 1));
        const output = { anyOf: branches };
        if (typeof source.description === 'string')
            output.description = boundedText(source.description, 1024);
        if (hadNull || source.nullable === true)
            output.nullable = true;
        return output;
    }
    let explicitType;
    let nullable = source.nullable === true;
    if (typeof source.type === 'string' && ALLOWED_SCHEMA_TYPES.has(source.type.toLowerCase()))
        explicitType = source.type.toLowerCase();
    else if (Array.isArray(source.type)) {
        const valid = [...new Set(source.type.filter((item) => typeof item === 'string').map((item) => item.toLowerCase()).filter((item) => ALLOWED_SCHEMA_TYPES.has(item)))];
        const nonNull = valid.filter((item) => item !== 'null');
        if (valid.includes('null') && nonNull.length > 0)
            nullable = true;
        explicitType = nonNull[0] ?? valid[0];
    }
    let enumValues;
    const hints = [];
    if (typeof source.const === 'string' && source.const.length > 0 && !hasControl(source.const)) {
        enumValues = [source.const.slice(0, 256)];
        explicitType ??= 'string';
    }
    else if (typeof source.const === 'number' || typeof source.const === 'boolean') {
        hints.push(`Must be ${String(source.const)}`);
        explicitType ??= typeof source.const;
    }
    else if (Array.isArray(source.enum)) {
        const rawEnum = source.enum.slice(0, 128).filter((item) => ['string', 'number', 'boolean'].includes(typeof item) && item !== '');
        if (rawEnum.length > 0) {
            if (rawEnum.every((item) => typeof item === 'string' && !hasControl(item))) {
                enumValues = rawEnum.map((item) => item.slice(0, 256));
                explicitType ??= 'string';
            }
            else {
                hints.push(`Allowed values: ${rawEnum.map((item) => JSON.stringify(item)).join(', ')}`);
            }
        }
    }
    const type = explicitType ?? (source.items !== undefined ? 'array' : 'object');
    const output = { type };
    const baseDesc = typeof source.description === 'string' ? boundedText(source.description, 1024) : '';
    const fullDesc = hints.length > 0 ? (baseDesc ? `${baseDesc} (${hints.join('; ')})` : hints.join('; ')) : baseDesc;
    if (fullDesc.length > 0)
        output.description = fullDesc;
    if (nullable && type !== 'null')
        output.nullable = true;
    if (enumValues !== undefined && enumValues.length > 0)
        output.enum = enumValues;
    if (type === 'object') {
        const properties = {};
        if (isRecord(source.properties)) {
            for (const [key, item] of Object.entries(source.properties).slice(0, 128)) {
                if (!hasControl(key) && key.length > 0)
                    properties[key.slice(0, 128)] = sanitizeSchema(item, depth + 1);
            }
        }
        output.properties = properties;
        if (Array.isArray(source.required)) {
            const validRequired = source.required.filter((item) => typeof item === 'string' && Object.prototype.hasOwnProperty.call(properties, item)).slice(0, 128);
            if (validRequired.length > 0)
                output.required = validRequired;
        }
    }
    else if (type === 'array') {
        output.items = source.items !== undefined ? sanitizeSchema(source.items, depth + 1) : { type: 'string' };
    }
    return output;
}
function safeFinish(value) {
    if (typeof value !== 'string' || value.length === 0 || value.length > 128)
        return undefined;
    const normalized = value.toUpperCase();
    return ['STOP', 'MAX_TOKENS', 'LENGTH', 'TOOL_CALLS', 'FUNCTION_CALL', 'SAFETY', 'BLOCKLIST', 'ERROR'].includes(normalized) ? normalized : undefined;
}
function safeSignature(value) {
    if (typeof value !== 'string' || value.length === 0 || value.length > PROXY_MAX_SIGNATURE_LENGTH)
        return undefined;
    for (const character of value) {
        const code = character.charCodeAt(0);
        if (code < 32 || code === 127)
            return undefined;
    }
    return value;
}
function boundedName(value) {
    return typeof value === 'string' && value.length > 0 && !hasControl(value) ? value.slice(0, 128) : 'unnamed_tool';
}
function boundedText(value, limit) {
    return typeof value === 'string' && !hasControl(value) ? value.slice(0, limit) : '';
}
function hasControl(value) {
    for (const character of value) {
        const code = character.charCodeAt(0);
        if (code < 32 || code === 127)
            return true;
    }
    return false;
}
function isFamily(value) {
    return value === 'gemini' || value === 'claude' || value === 'gpt-oss' || value === 'unknown';
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
//# sourceMappingURL=replay.js.map