/**
 * DSH 请求历史 → ACP `session/prompt` 内容的序列化（原创实现）。
 *
 * 设计前提（硬约束）：**DSH 是历史权威**。本文件不建任何会话存储、数据库
 * 或文件——新轮把 `GenerateOptions.messages` + `options.system` 完整编码进
 * ACP prompt，工具续轮则直接通过 MCP 返回结果，不重复发送历史。
 *
 * 载体格式：ACP 的 `PromptRequest.prompt` 是 `ContentBlock[]`，本实现把每条
 * DSH 消息编码成一个 `TextContent` 信封块：
 *
 *     <dsh-message role="user">{"content":[{"type":"text","text":"hi"}]}</dsh-message>
 *
 * 信封用尖括号标签（与 JSON 字符串正文互不干扰：标签本身不是合法 JSON），
 * role 属性保留了角色边界，正文是该消息 content 块的 JSON 数组。
 * `parsePromptTranscript` 可无损还原 role 与 content，因此映射是**可逆**的；
 * 需要建立新轮时，历史里的 tool-call / tool result 同样以信封进入 prompt，
 * agent 得以看到完整的 DSH 侧工具轨迹。
 *
 * `options.system` 单独编码为一个 `<dsh-system>` 块放在最前。
 */
import type { ContentBlock } from '@agentclientprotocol/sdk';
import type { RequestMessage, ToolSchema } from '@deepseek-ai/dsh-llm';
/** 历史重放说明块的哨兵（固定文本，不参与消息逆解析）。 */
export declare const HISTORY_OPEN = "<dsh-conversation-history>";
export declare const HISTORY_CLOSE = "</dsh-conversation-history>";
/** 当前请求强调块的哨兵（纯文本，不参与消息逆解析）。 */
export declare const CURRENT_REQUEST_OPEN = "<dsh-current-request>";
export declare const CURRENT_REQUEST_CLOSE = "</dsh-current-request>";
/**
 * 每次 prompt 都会附带的一段工具策略说明。
 *
 * 会话同时关闭 AGY 内置工具和 ACP fs/terminal，并加载 DSH 的 MCP schema。
 * 此处说明工具入口与结果语义，避免模型沿用原生工具习惯或误解 DSH 的拒绝。
 */
export declare const TOOL_POLICY_TEXT: string;
/**
 * 历史重放说明。新轮会把整段 DSH 历史（含大量工具轨迹）编码进同一条 ACP
 * prompt；官方 agent 每轮新建会话、没有原生对话历史，只能靠这段文字判断
 * 「现在要做什么」。不声明边界时它会顺着历史里未完成的任务继续跑，表现为
 * 「用户后续的话没传过去」。
 */
export declare const HISTORY_NOTICE_TEXT: string;
/** 当前请求说明：把最新一条真实用户消息从历史里单独强调出来。 */
export declare const CURRENT_REQUEST_NOTICE_TEXT: string;
/** 解析出的单条消息信封。 */
export interface TranscriptEntry {
    /** DSH 消息角色。 */
    role: string;
    /** 该消息的 content 块（JSON 还原，形状与 DSH ContentBlock 一致）。 */
    content: unknown[];
    toolCallId?: string;
    isError?: boolean;
}
/** 把一条 DSH 请求消息编码成信封文本。 */
export declare function encodeMessage(message: RequestMessage): string;
/**
 * 构造一次 ACP prompt 的 content 块序列：system（若给出）在前，随后工具策略、
 * 历史重放说明、每条 DSH 消息一个信封块，最后是最新用户请求的强调块。
 * 空 system 文本不产生块（ACP 的 TextContent.text 为空串没有语义价值）。
 */
export declare function buildPromptContent(system: string | undefined, messages: readonly RequestMessage[], tools?: readonly ToolSchema[]): ContentBlock[];
/** 历史重放说明块；不参与消息逆解析。 */
export declare function historyNoticeBlock(): ContentBlock;
/**
 * 最新的真实用户请求。
 *
 * DSH 会在用户消息之后继续追加 `user` 角色的注入块（time-context /
 * runtime-context / hindsight / 技能目录…），它们带自己的 `source.kind`；
 * 只看 role 会把最后一条注入块误当请求。一次性请求（RequestUserInput）没有
 * source，按用户输入处理。
 */
export declare function latestUserRequest(messages: readonly RequestMessage[]): RequestMessage | undefined;
/**
 * 当前请求强调块：纯文本复制最新用户消息的可见内容。
 *
 * 刻意不复制 `<dsh-message>` 信封——否则 `parsePromptTranscript` 会把同一条
 * 消息解析两次；这里只需要给模型一个明确的「现在回这条」信号。
 */
export declare function currentRequestBlock(messages: readonly RequestMessage[]): ContentBlock | undefined;
/**
 * 逆解析：从一组 ACP TextContent 文本中还原 system 文本与消息信封序列。
 * 供测试断言 prompt 重建结果；生产路径不依赖它。
 */
export declare function parsePromptTranscript(blocks: readonly ContentBlock[]): {
    system?: string;
    entries: TranscriptEntry[];
};
/** Legacy text-only helper; native image results use buildToolResultContent. */
export declare function renderToolResultText(blocks: readonly {
    type: string;
    [key: string]: unknown;
}[]): string;
