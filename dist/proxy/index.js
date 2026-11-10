import { LlmError } from '@deepseek-ai/dsh-llm';
import { AntigravityProxyAdapter, PROXY_PROVIDER_ID } from './adapter.js';
import { createProxyTransport } from './transport.js';
import { ProxyConfigError, resolveHttpsProxy } from '../runtime/proxy-env.js';
export const name = 'antigravity-proxy-router';
export const inject = ['llm'];
export function apply(ctx, _config = {}) {
    // 附件服务是可选依赖：在场时代理模式接受图片输入，缺席时文本能力不受影响。
    // 读取面经 getter 惰性传给 adapter，服务后到或卸载都不需要重建路由。
    let attachments;
    ctx.inject(['attachments'], (scope) => {
        const store = scope.get('attachments');
        attachments = store;
        scope.effect(() => () => { if (attachments === store)
            attachments = undefined; });
    });
    // 弱等待宿主行的两个 provide：宿主行未装载时本行不注册路由（默认关闭语义）。
    ctx.inject(['antigravityProxyAuth', 'antigravityProxyMode'], (scope) => {
        const auth = scope.get('antigravityProxyAuth');
        const bus = scope.get('antigravityProxyMode');
        if (!auth || !bus)
            return;
        mountProxyRouter(scope, auth, bus, () => attachments);
    });
}
function mountProxyRouter(ctx, auth, bus, readAttachments) {
    // 代理链路的出网代理与官方进程同一套设置；非法地址不阻断装载（设置页仍可修正）。
    const transport = createProxyTransport({
        resolveProxy: () => {
            try {
                const settings = bus.proxySettings();
                return resolveHttpsProxy({ url: settings.url, bypass: settings.bypass });
            }
            catch (error) {
                if (error instanceof ProxyConfigError) {
                    throw new LlmError(`代理配置无效，代理模式无法出网：${error.message}`, 'AGY_INVALID_PROXY');
                }
                throw error;
            }
        },
    });
    const adapter = new AntigravityProxyAdapter({
        credential: auth,
        transport,
        attachments: readAttachments,
        readSettings: () => bus.modelSettings?.() ?? {},
        log: {
            info: (message) => ctx.logger?.info?.(message),
            warn: (message, error) => ctx.logger?.warn?.(`${message}${error ? `: ${error instanceof Error ? error.message : String(error)}` : ''}`),
        },
    });
    ctx.provide('antigravityProxyCatalog', { models: (force) => adapter.discoverModels(force) });
    let registration;
    const syncRegistration = (mode) => {
        const want = mode && ctx.llm !== undefined;
        if (want && registration === undefined) {
            registration = ctx.llm.registerAdapter([PROXY_PROVIDER_ID], adapter);
            ctx.logger?.info?.('antigravity-proxy: 代理路由已注册（ACP 路由由宿主行注销）');
            try {
                ctx.emit('llm/adapters-updated');
            }
            catch { /* 观察者不能否决目录更新 */ }
        }
        else if (!want && registration !== undefined) {
            registration();
            registration = undefined;
            adapter.invalidateModelCatalog();
            ctx.logger?.info?.('antigravity-proxy: 代理路由已注销');
            try {
                ctx.emit('llm/adapters-updated');
            }
            catch { /* 同上 */ }
        }
    };
    // 初始状态 + 后续切换都走同一条幂等路径。
    syncRegistration(bus.current());
    const unsubscribe = bus.subscribe((mode) => {
        try {
            syncRegistration(mode);
        }
        catch (error) {
            bus.setRouterReady(false);
            ctx.logger?.warn?.(`antigravity-proxy: 路由注册失败，ACP 保持停用：${error instanceof Error ? error.message : String(error)}`);
        }
    });
    const unsubscribeAccount = auth.subscribe(() => {
        adapter.invalidateModelCatalog();
        try {
            ctx.emit('llm/adapters-updated');
        }
        catch { /* 观察者不能否决目录更新 */ }
    });
    try {
        // 先取得代理路由，再允许宿主撤下 ACP，注册失败不能留下空路由。
        syncRegistration(bus.requested());
        bus.setRouterReady(true);
    }
    catch (error) {
        unsubscribe();
        unsubscribeAccount();
        if (registration)
            registration();
        bus.setRouterReady(false);
        throw error;
    }
    ctx.effect(function* () {
        yield () => {
            unsubscribe();
            unsubscribeAccount();
            if (registration !== undefined) {
                registration();
                registration = undefined;
            }
            bus.setRouterReady(false);
        };
    }, 'antigravity-proxy 路由生命周期清理');
}
//# sourceMappingURL=index.js.map