/**
 * 识别官方 ACP 权限提示中的私有 MCP 路由。元数据不是独立身份证明：
 * 调用方必须同时通过 session/new 禁用 AGY 内置工具和 ACP fs/terminal 能力。
 * 此处只允许进入私有桥，最终参数校验、审批、沙箱与执行仍由 DSH 负责。
 */
import type { RequestPermissionRequest } from '@agentclientprotocol/sdk';
import type { ToolSchema } from '@deepseek-ai/dsh-llm';
export declare function parsePermissionHandoff(request: RequestPermissionRequest, context: {
    sessionId: string;
    serverName: string;
    tools: readonly ToolSchema[];
}): {
    name: string;
    arguments: string;
} | undefined;
