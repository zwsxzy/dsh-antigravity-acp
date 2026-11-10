const INPUT_FIELDS = [
    'ServerName', 'ToolName', 'Arguments', 'name', 'tool_name', 'toolName',
    'server_name', 'serverName', 'args', 'input', 'arguments', 'parameters',
    'tool_input', 'toolInput',
];
const TOOL_KINDS = new Set(['read', 'edit', 'delete', 'move', 'search', 'execute', 'think', 'fetch', 'switch_mode', 'other']);
const OPTION_KINDS = ['allow_once', 'allow_always', 'reject_once', 'reject_always'];
function record(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value
        : undefined;
}
function shape(value) {
    if (value === null || value === undefined)
        return 'absent';
    if (Array.isArray(value))
        return 'array';
    return typeof value;
}
function inputSummary(value, serverName, toolNames) {
    const input = record(value);
    return {
        shape: shape(value),
        fields: INPUT_FIELDS.filter((key) => input && Object.hasOwn(input, key)),
        // 仅陈述与当前目录的关系，不输出参数值，更不把这些模型可控参数当作可信身份。
        serverMatches: input?.ServerName === serverName || input?.server_name === serverName || input?.serverName === serverName,
        toolAdvertised: [input?.ToolName, input?.tool_name, input?.toolName].some((name) => typeof name === 'string' && toolNames.includes(name)),
    };
}
export function describePermissionRequest(request, context) {
    const call = request.toolCall;
    const input = record(call.rawInput);
    const meta = record(call._meta);
    const mcp = record(meta?.mcp);
    return {
        sessionMatches: request.sessionId === context.sessionId,
        programmaticName: call.name === 'call_mcp_tool' ? 'mcp-wrapper' : call.name == null ? 'absent' : 'other',
        kind: call.kind == null ? 'absent' : TOOL_KINDS.has(call.kind) ? call.kind : 'unrecognized',
        titlePresent: typeof call.title === 'string',
        metaPresent: request._meta != null || call._meta != null,
        // 官方 1.4.0 从参数信封生成；需结合会话工具过滤，不能作为独立执行身份。
        mcpMeta: {
            marked: meta?.is_mcp_tool_call === true,
            serverMatches: mcp?.server === context.serverName,
            toolAdvertised: typeof mcp?.tool === 'string' && context.toolNames.includes(mcp.tool),
        },
        input: inputSummary(call.rawInput, context.serverName, context.toolNames),
        // 有界检查固定包装层，避免依赖尚未实测的 rawInput 结构，也不遍历任意正文。
        nested: ['args', 'input', 'arguments', 'parameters', 'tool_input', 'toolInput']
            .filter((key) => input && Object.hasOwn(input, key))
            .map((key) => ({ field: key, ...inputSummary(input?.[key], context.serverName, context.toolNames) })),
        options: OPTION_KINDS.filter((kind) => request.options.some((option) => option.kind === kind)),
    };
}
//# sourceMappingURL=permission-diagnostic.js.map