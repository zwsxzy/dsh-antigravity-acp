/**
 * 让插件自己发出的 HTTPS 请求（二进制下载、OAuth 换发、Cloud Code Assist 额度）
 * 也走插件配置的 `proxyUrl`。
 *
 * 背景：Node 的 `fetch` 不读 `HTTP_PROXY`。宿主（dsh-http-proxy）只按**启动环境**
 * 给全局 undici dispatcher 装代理；插件设置页里填的 `proxyUrl` 此前只传给了子进程，
 * 插件自身的 `fetch` 完全没用上——直连不通 Google 的机器上，下载与换发会一直挂着。
 *
 * 显式配置代理时，依赖加载、协议或连接失败均报错，不退回其它出口。
 * 只有未配置代理或目标明确在 bypass 列表时使用宿主 fetch。
 */
import type { ResolvedProxy } from './proxy-env.js';
/** 只描述用到的 undici 面，避免依赖其类型。 */
export interface UndiciLike {
    ProxyAgent: new (options: {
        uri: string;
        token?: string;
        username?: string;
        password?: string;
    }) => {
        close?(): Promise<void>;
        destroy?(): Promise<void>;
    };
    fetch: (input: string, init?: Record<string, unknown>) => Promise<Response>;
}
export type ManagedFetch = typeof fetch & {
    close(): Promise<void>;
};
export declare const PROXY_CLOSE_TIMEOUT_MS = 2000;
export interface ProxiedFetchDeps {
    /** 加载 undici；失败返回 undefined。测试注入替身。 */
    loadUndici?: () => Promise<UndiciLike | undefined>;
    /** 直连/宿主路由所用的 fetch；默认全局 fetch。 */
    fallback?: typeof fetch;
}
/**
 * 排除列表匹配：精确主机、`*.x` / `.x` 后缀。CIDR 等复杂写法不支持（这里的目标
 * 只有固定的 Google 域名，列表主要用来放行 loopback）。
 */
export declare function matchesBypass(hostname: string, bypass: string): boolean;
/** Resolve routing at request boundaries; keep old agents until unload so an
 * in-flight response is never destroyed by a settings save. */
export declare function createLiveProxiedFetch(readProxy: () => ResolvedProxy | undefined, deps?: ProxiedFetchDeps): ManagedFetch;
export declare function createProxiedFetch(proxy: ResolvedProxy | undefined, deps?: ProxiedFetchDeps): ManagedFetch;
