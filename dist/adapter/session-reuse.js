/** ACP 会话的输入前缀、已交付输出与上下文去重。DSH 始终是历史权威。 */
import { createHash } from 'node:crypto';
import { messageValue, stable } from './continuation-state.js';
export function reusableSessionKey(options) {
    if (options.purpose !== undefined || !options.sessionId)
        return undefined;
    return `${options.sessionId}::chat`;
}
export function messageSourceKind(message) {
    const source = message.source;
    return source && typeof source.kind === 'string' ? source.kind : undefined;
}
export function messageSourceForm(message) {
    const source = message.source;
    return source && typeof source.form === 'string' ? source.form : undefined;
}
/** assistant 只有通过 outputMatches 验证后才可跳过；context form 本身不是丢弃依据。 */
export function shouldSendIncrement(message) {
    return message.role !== 'assistant';
}
/** 只对上下文载体去重；真实用户输入、notice、relay 与未知类别每次都保留。 */
function contextKey(message) {
    if (message.role !== 'user')
        return undefined;
    const kind = messageSourceKind(message);
    if (!kind || kind === 'user' || kind === 'compact-checkpoint' || kind === 'model-selection')
        return undefined;
    const form = messageSourceForm(message);
    if (!['snapshot', 'catalog', 'instructions', 'recall'].includes(form ?? ''))
        return undefined;
    return stable([kind, form]);
}
/**
 * 只省略确实已经发送的相同上下文。快照/目录跟踪最近版本，A→B→A 仍须发送 A；
 * 指令也可能撤回/恢复旧版本，未知文件身份时保守按最近版本判断；仅召回材料按完整内容去重。
 */
export function incrementalMessages(messages, sentCount) {
    const latest = new Map();
    const seen = new Set();
    const result = [];
    for (const [index, message] of messages.entries()) {
        const key = contextKey(message);
        let duplicate = false;
        if (key !== undefined) {
            const fingerprint = messageFingerprint(message);
            const stateful = messageSourceForm(message) !== 'recall';
            duplicate = stateful ? latest.get(key) === fingerprint : seen.has(`${key}\0${fingerprint}`);
            latest.set(key, fingerprint);
            seen.add(`${key}\0${fingerprint}`);
        }
        if (index >= sentCount && shouldSendIncrement(message) && !duplicate)
            result.push(message);
    }
    // 当前用户请求最后强调；其余新增消息的相对顺序保持不变。
    const latestUser = result.findLastIndex(message => message.role === 'user'
        && (messageSourceKind(message) === undefined || messageSourceKind(message) === 'user'));
    if (latestUser >= 0 && latestUser < result.length - 1)
        result.push(...result.splice(latestUser, 1));
    return result;
}
export function messageFingerprint(message) {
    return stable(messageValue(message));
}
export function prefixHash(messages, count = messages.length) {
    const hash = createHash('sha256');
    for (const message of messages.slice(0, count))
        hash.update(messageFingerprint(message)).update('\0');
    return hash.digest('hex');
}
export function prefixMatches(messages, sentCount, sentHash) {
    return Number.isSafeInteger(sentCount) && sentCount >= 0 && sentCount <= messages.length
        && prefixHash(messages, sentCount) === sentHash;
}
/** 存储实际交付的 blocks 指纹，不落盘输出正文。 */
export function outputHash(blocks) {
    return createHash('sha256').update(stable(blocks)).digest('hex');
}
/** 新历史中的 assistant 必须正好是上一步交付的输出，且位于所有新输入之前。 */
export function outputMatches(fresh, expected) {
    if (expected === undefined)
        return false;
    const blocks = [];
    let inputSeen = false;
    for (const message of fresh) {
        if (message.role === 'assistant') {
            if (inputSeen)
                return false;
            blocks.push(...message.content);
        }
        else
            inputSeen = true;
    }
    return outputHash(blocks) === expected;
}
export function routeFingerprint(options, override) {
    return createHash('sha256').update(stable({
        provider: options.provider, model: options.model, effort: options.reasoningEffort?.toString(),
        // 公开模型 ID 不变时，设置页的官方映射或默认档位仍可能改变实际路由。
        override,
        system: options.system ?? '',
        tools: [...(options.tools ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    })).digest('hex');
}
//# sourceMappingURL=session-reuse.js.map