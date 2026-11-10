/**
 * 代理账户 remote：把代理模式的账户控制面经 Typert Gateway 暴露给设置页。
 *
 * 与 `quota/quota-remote.ts` 同一接线手法（generated-contribution 形态的
 * invocations 描述符），但命名空间独立为 `agyProxyAccount`：
 * - `status`：阶段 / 邮箱 / 来源 / 更新时间（不含凭据与授权 URL）；
 * - `login`：启动 loopback 登录，返回**一次性**授权 URL 供设置页展示；
 * - `cancel` / `logout`：取消在途登录 / 清除本地登录态。
 *
 * 额度快照本身仍走既有 `agyQuota.read`：宿主行的额度服务按当前模式选择
 * 取数来源（CLI / HTTP 回退 / 代理账户），客户端药丸无需感知模式。
 */
import type { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { InvocationDescriptor } from '@deepseek-ai/dsh-typert-protocol';
import type { ProxyAccountService, ProxyAccountSnapshot } from './account-service.js';
export declare const PACKAGE_NAME = "dsh-bundle-antigravity-host";
export declare const AGY_PROXY_ACCOUNT_SERVICE = "agyProxyAccount";
export interface ProxyAccountRequest {
    action?: 'status' | 'login' | 'cancel' | 'logout';
}
export interface ProxyAccountResult {
    snapshot: ProxyAccountSnapshot;
    authorizationUrl?: string;
    message: string;
}
export declare const AGY_PROXY_ACCOUNT_INVOCATIONS: readonly InvocationDescriptor[];
/** Host 侧服务实现：失败折叠成 message，不向客户端抛原始错误。 */
export declare class AgYProxyAccountService extends TypertRemoteService {
    private readonly auth;
    private inflight;
    constructor(ctx: Context, auth: ProxyAccountService);
    account(request?: ProxyAccountRequest): Promise<ProxyAccountResult>;
}
