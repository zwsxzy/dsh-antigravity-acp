/**
 * ACP 权限请求的固定词表诊断，不参与授权决策。
 * 不输出 title、调用 id、元数据、参数正文、任意字段名或未知工具名。
 */
import type { RequestPermissionRequest } from '@agentclientprotocol/sdk';
export declare function describePermissionRequest(request: RequestPermissionRequest, context: {
    sessionId: string;
    serverName: string;
    toolNames: readonly string[];
}): {
    sessionMatches: boolean;
    programmaticName: string;
    kind: string;
    titlePresent: boolean;
    metaPresent: boolean;
    mcpMeta: {
        marked: boolean;
        serverMatches: boolean;
        toolAdvertised: boolean;
    };
    input: {
        shape: string;
        fields: ("parameters" | "name" | "input" | "arguments" | "ServerName" | "ToolName" | "Arguments" | "tool_name" | "toolName" | "server_name" | "serverName" | "args" | "tool_input" | "toolInput")[];
        serverMatches: boolean;
        toolAdvertised: boolean;
    };
    nested: {
        shape: string;
        fields: ("parameters" | "name" | "input" | "arguments" | "ServerName" | "ToolName" | "Arguments" | "tool_name" | "toolName" | "server_name" | "serverName" | "args" | "tool_input" | "toolInput")[];
        serverMatches: boolean;
        toolAdvertised: boolean;
        field: string;
    }[];
    options: ("allow_once" | "allow_always" | "reject_once" | "reject_always")[];
};
export type PermissionDiagnostic = ReturnType<typeof describePermissionRequest>;
