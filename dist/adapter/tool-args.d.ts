/**
 * 工具参数签名渲染与参数预检（原创实现）。
 *
 * 背景：官方 agy 只把 MCP 工具 schema 写成磁盘文件，模型调用时常常没读，凭原生
 * 工具的习惯猜参数名（`path` 而非 `file_path`）或漏掉看起来只给 UI 用的必填项
 * （`description`）。这里提供签名、保守别名修正和桥内预检：
 * 1. `renderToolSignatures`：把当前目录渲染成紧凑的类 TypeScript 签名，进入 prompt；
 * 2. `inspectToolArguments`：只对照 schema 的 `properties` / `required` 做**保守**
 *    检查（不校验类型），供桥提前给模型可操作的错误、供日志诊断。
 *
 * DSH 工具管线的最终校验仍然是权威；这里的检查绝不能比它更严格。
 */
import type { ToolSchema } from '@deepseek-ai/dsh-llm';
/** 参数预检结果。 */
export interface ToolArgumentIssues {
    /** schema `required` 里声明、但调用里缺失的键；null 是否合法由 DSH 校验。 */
    missing: string[];
    /** 调用里出现、但 schema `properties` 未声明的键（仅在 schema 声明了 properties 时判定）。 */
    unknown: string[];
}
/** `read(file_path: string, offset?: number, limit?: number)`；必填在前，可选带 `?`。 */
export declare function renderToolSignature(tool: ToolSchema): string;
/** 整个目录的签名块正文；空目录返回 undefined（不产生块）。 */
export declare function renderToolSignatures(tools: readonly ToolSchema[]): string | undefined;
/**
 * 对照 schema 检查一次调用的参数键。只看 `required` 与 `properties`，不检查类型、
 * 取值或 `additionalProperties`，因此不会拒绝 DSH 自己会接受的调用。
 */
export declare function inspectToolArguments(tool: Pick<ToolSchema, 'parameters'>, args: unknown): ToolArgumentIssues;
/** 仅当 schema 中目标唯一、输入中来源唯一且目标缺失时，修正常见的字符串参数名。 */
export declare function normalizeToolArguments(tool: Pick<ToolSchema, 'parameters'>, args: unknown): {
    arguments: Record<string, unknown>;
    renamed: Array<{
        from: string;
        to: string;
    }>;
};
/** 键名只有形如标识符且不过长时才可进日志/错误文案（模型可控字符串不原样回显）。 */
export declare function safeKeyNames(keys: readonly string[], limit?: number): string[];
