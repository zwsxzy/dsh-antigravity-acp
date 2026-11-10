import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { toProxyAccountError } from './account-service.js';
export const PACKAGE_NAME = 'dsh-bundle-antigravity-host';
export const AGY_PROXY_ACCOUNT_SERVICE = 'agyProxyAccount';
function parseRequest(value) {
    if (value === undefined || value === null)
        return {};
    if (typeof value !== 'object' || Array.isArray(value))
        throw new TypeError('Invalid AgYProxyAccountRequest');
    const action = value.action;
    if (action !== undefined && !['status', 'login', 'cancel', 'logout'].includes(String(action)))
        throw new TypeError('Invalid AgYProxyAccountRequest.action');
    return action === undefined ? {} : { action: action };
}
function parseResult(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        throw new TypeError('Invalid AgYProxyAccountResult');
    const record = value;
    if (typeof record.message !== 'string' || typeof record.snapshot !== 'object' || record.snapshot === null)
        throw new TypeError('Invalid AgYProxyAccountResult');
    return value;
}
function strictCodec(typeSymbol, parse) {
    const schema = { parse };
    return { mode: 'strict', typeSymbol, create: () => schema };
}
const requestCodec = strictCodec(`${PACKAGE_NAME}#AgYProxyAccountRequest`, parseRequest);
const resultCodec = strictCodec(`${PACKAGE_NAME}#AgYProxyAccountResult`, parseResult);
export const AGY_PROXY_ACCOUNT_INVOCATIONS = [
    {
        id: `${PACKAGE_NAME}#${AGY_PROXY_ACCOUNT_SERVICE}/account`,
        service: AGY_PROXY_ACCOUNT_SERVICE,
        namespace: AGY_PROXY_ACCOUNT_SERVICE,
        method: 'account',
        invocation: { kind: 'direct' },
        parameters: [{ name: 'request', wire: 'request', source: 'json', acceptsUndefined: true, codec: requestCodec }],
        result: resultCodec,
    },
];
/** Host 侧服务实现：失败折叠成 message，不向客户端抛原始错误。 */
export class AgYProxyAccountService extends TypertRemoteService {
    auth;
    inflight;
    constructor(ctx, auth) {
        super(ctx, AGY_PROXY_ACCOUNT_SERVICE);
        this.auth = auth;
    }
    async account(request) {
        const action = request?.action ?? 'status';
        if (action === 'status') {
            const snapshot = this.auth.status();
            return { snapshot, message: snapshot.message };
        }
        if (action === 'login' && this.inflight)
            return this.inflight;
        // 取消/退出必须立即进入账户服务，不能并入尚未完成的登录。
        if (action !== 'login')
            this.inflight = undefined;
        const run = (async () => {
            try {
                if (action === 'login') {
                    const started = await this.auth.login();
                    return {
                        snapshot: this.auth.status(),
                        ...(started.authorizationUrl === undefined ? {} : { authorizationUrl: started.authorizationUrl }),
                        message: started.message,
                    };
                }
                if (action === 'cancel') {
                    await this.auth.cancelLogin();
                    return { snapshot: this.auth.status(), message: '代理模式登录已取消' };
                }
                await this.auth.logout();
                return { snapshot: this.auth.status(), message: '代理模式登录态已清除' };
            }
            catch (error) {
                const safe = toProxyAccountError(error);
                return { snapshot: this.auth.status(), message: safe.message };
            }
        })();
        if (action === 'login')
            this.inflight = run;
        try {
            return await run;
        }
        finally {
            if (this.inflight === run)
                this.inflight = undefined;
        }
    }
}
//# sourceMappingURL=account-remote.js.map