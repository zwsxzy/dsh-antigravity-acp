import { ProxyConfigError } from './proxy-env.js';
export const PROXY_CLOSE_TIMEOUT_MS = 2_000;
async function defaultLoadUndici() {
    try {
        const module = (await import('undici'));
        if (typeof module.ProxyAgent === 'function' && typeof module.fetch === 'function')
            return module;
        return undefined;
    }
    catch {
        return undefined;
    }
}
/** undici 8 支持 SOCKS5，域名由代理解析，因此 socks5h 可映射到 socks5。 */
function isSupportedProxy(url) {
    return /^(https?|socks5h?):\/\//i.test(url);
}
/**
 * 排除列表匹配：精确主机、`*.x` / `.x` 后缀。CIDR 等复杂写法不支持（这里的目标
 * 只有固定的 Google 域名，列表主要用来放行 loopback）。
 */
export function matchesBypass(hostname, bypass) {
    const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
    for (const raw of bypass.split(',')) {
        let entry = raw.trim().toLowerCase();
        if (!entry)
            continue;
        if (entry === '*')
            return true;
        // 不把 IPv6 的最后一段误当成端口；有端口的 IPv6 必须带方括号。
        if (entry.startsWith('['))
            entry = /^\[([^\]]+)\](?::\d+)?$/.exec(entry)?.[1] ?? entry;
        else if (entry.split(':').length === 2)
            entry = entry.replace(/:\d+$/, '');
        if (entry === host)
            return true;
        if (entry.startsWith('*.') && host.endsWith(entry.slice(1)))
            return true;
        if (entry.startsWith('.') && host.endsWith(entry))
            return true;
    }
    return false;
}
/** Resolve routing at request boundaries; keep old agents until unload so an
 * in-flight response is never destroyed by a settings save. */
export function createLiveProxiedFetch(readProxy, deps = {}) {
    const routes = new Map();
    let closed = false;
    const request = (input, init) => {
        if (closed)
            return Promise.reject(new ProxyConfigError('代理传输已关闭；请求未发送'));
        let proxy;
        try {
            proxy = readProxy();
        }
        catch (error) {
            // readProxy 会按当前设置重新解析；地址被改坏时按 fetch 契约返回 rejected
            // promise 而不是同步抛，避免调用方在 `.catch()` 上拿到 undefined。
            return Promise.reject(error);
        }
        const key = JSON.stringify(proxy ?? null);
        let route = routes.get(key);
        if (!route) {
            route = createProxiedFetch(proxy, deps);
            routes.set(key, route);
        }
        return route(input, init);
    };
    return Object.assign(request, { close: async () => {
            closed = true;
            const results = await Promise.allSettled([...routes.values()].map(route => route.close()));
            routes.clear();
            const failed = results.find((result) => result.status === 'rejected');
            if (failed)
                throw failed.reason;
        } });
}
export function createProxiedFetch(proxy, deps = {}) {
    const fallback = deps.fallback ?? ((input, init) => globalThis.fetch(input, init));
    if (!proxy)
        return Object.assign(((input, init) => fallback(input, init)), { close: async () => undefined });
    if (!isSupportedProxy(proxy.url))
        throw new ProxyConfigError('插件请求支持 HTTP、HTTPS、SOCKS5 代理；不支持 SOCKS4');
    const load = deps.loadUndici ?? defaultLoadUndici;
    let closed = false;
    let prepared;
    const prepare = () => {
        prepared ??= load().catch(() => undefined).then((undici) => {
            if (!undici)
                throw new ProxyConfigError('无法加载代理传输依赖 undici；请求未发送，请重新安装插件');
            try {
                const uri = new URL(proxy.url);
                if (uri.protocol === 'socks5h:')
                    uri.protocol = 'socks5:';
                // SOCKS5 认证由 undici 从 URL 中读取，不使用 HTTP Proxy-Authorization。
                if (uri.protocol === 'socks5:')
                    return { undici, agent: new undici.ProxyAgent({
                            uri: uri.href, username: decodeURIComponent(uri.username), password: decodeURIComponent(uri.password),
                        }) };
                const token = uri.username || uri.password
                    ? `Basic ${Buffer.from(`${decodeURIComponent(uri.username)}:${decodeURIComponent(uri.password)}`).toString('base64')}`
                    : undefined;
                uri.username = '';
                uri.password = '';
                return { undici, agent: new undici.ProxyAgent({ uri: uri.href, ...(token ? { token } : {}) }) };
            }
            catch {
                throw new ProxyConfigError('无法初始化代理传输；请求未发送，请检查代理设置');
            }
        });
        return prepared;
    };
    const doFetch = async (input, init) => {
        if (closed)
            throw new ProxyConfigError('代理传输已关闭；请求未发送');
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        let hostname = '';
        try {
            hostname = new URL(url).hostname;
        }
        catch {
            throw new ProxyConfigError('请求地址无效；请求未发送');
        }
        if (matchesBypass(hostname, proxy.bypass))
            return fallback(input, init);
        const route = await prepare();
        if (closed)
            throw new ProxyConfigError('代理传输已关闭；请求未发送');
        const requestInit = input instanceof Request ? {
            method: input.method, headers: input.headers, body: input.body,
            signal: input.signal, redirect: input.redirect, credentials: input.credentials,
            cache: input.cache, integrity: input.integrity, keepalive: input.keepalive,
            referrer: input.referrer, referrerPolicy: input.referrerPolicy, duplex: 'half',
        } : {};
        return route.undici.fetch(url, { ...requestInit, ...init, dispatcher: route.agent });
    };
    let closing;
    return Object.assign(doFetch, { close: () => {
            closed = true;
            closing ??= (async () => {
                const stop = (async () => {
                    const route = await prepared?.catch(() => undefined);
                    if (!route)
                        return;
                    // close() 等待消费完响应体；错误状态响应通常尚未消费，必须主动销毁连接。
                    await (route.agent.destroy ? route.agent.destroy() : route.agent.close?.());
                })();
                let timer;
                try {
                    await Promise.race([
                        stop,
                        new Promise((_resolve, reject) => {
                            timer = setTimeout(() => reject(new ProxyConfigError('代理连接回收超时')), PROXY_CLOSE_TIMEOUT_MS);
                        }),
                    ]);
                }
                finally {
                    if (timer)
                        clearTimeout(timer);
                }
            })();
            return closing;
        } });
}
//# sourceMappingURL=proxied-fetch.js.map