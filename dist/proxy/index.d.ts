/**
 * 代理模式行入口（bundle 第二组件 `antigravity-proxy-router`）。
 *
 * 职责边界：
 * - 只注册 `antigravity-proxy` 路由与代理账户的 Typert remote；
 * - 不 spawn 官方进程、不碰 ACP 链路；官方 ACP 的注销由宿主行按同一模式标志执行；
 * - 凭据服务 `antigravityProxyAuth` 与模式总线 `antigravityProxyMode` 由宿主行
 *   provide（账户存储、OAuth 流与代理感知 fetch 都在宿主行）。本行用
 *   `ctx.inject` 弱等待：宿主行缺席时本行安静地不注册任何路由，而不是挂死。
 *
 * 模式默认关闭：`proxyMode` 为 false 时不注册路由；设置页仍可提前登录代理账户。
 */
import type { Context } from '@deepseek-ai/cordis';
export declare const name = "antigravity-proxy-router";
export declare const inject: string[];
export interface ProxyRouterConfig {
    responseHeaderTimeoutMs?: number;
}
export declare function apply(ctx: Context, _config?: ProxyRouterConfig): void;
