import type { QuotaSnapshot } from '../runtime/quota.js';
import type { ProxyCredentialSource } from './adapter.js';
import type { ProxyTransport } from './transport.js';
export interface ProxyQuotaDeps {
    credential: ProxyCredentialSource;
    transport: ProxyTransport;
    log?: {
        info(message: string): void;
        warn(message: string, error?: unknown): void;
    };
}
/** 取一份额度快照；任何失败都折叠成 error 快照，不抛穿线。 */
export declare function fetchProxyQuotaSnapshot(deps: ProxyQuotaDeps, signal?: AbortSignal): Promise<QuotaSnapshot>;
/** 连接阶段只读解析已有项目，与参考插件 project-context 的探测流程一致。 */
export declare function resolveProxyProject(accessToken: string, transport: ProxyTransport, signal?: AbortSignal): Promise<string>;
