/**
 * 代理模式控制总线：宿主行创建并 provide，代理行与额度监控消费。
 *
 * 单一事实源：`proxyMode` 的当前值只从宿主配置的 volatile 引用读取；
 * 订阅者（代理行注册、宿主行注销、额度源切换）各自幂等反应。
 * 请求代理模式就立即停用 ACP；代理路由是否就绪只影响代理自身，不得回退启动 ACP。
 */
export interface ProxyModeBus {
    /** 当前生成模式；与代理路由就绪状态无关。 */
    current(): boolean;
    requested(): boolean;
    routerReady(): boolean;
    setRouterReady(ready: boolean): void;
    /** 订阅模式变化；返回退订函数。 */
    subscribe(listener: (mode: boolean) => void): () => void;
    /** 代理链路的出网代理设置（与官方进程同一套 proxyUrl / proxyBypass）。 */
    proxySettings(): {
        url?: string;
        bypass?: string;
    };
    modelSettings?(): {
        modelOverrides?: import('../settings.js').AntigravityHostConfig['modelOverrides'];
    };
}
export type GenerationMode = 'acp' | 'proxy';
export interface ModeRegistrationPlan {
    /** 官方 ACP 路由是否应在册。 */
    acp: boolean;
    /** 代理路由是否应在册。 */
    proxy: boolean;
}
/**
 * 模式 → 注册计划。代理行未装载（服务缺失）时由调用方把 proxy 降为 false；
 * 这只表示代理路由不在册，ACP 仍按请求的模式保持注销，不回退。本函数只表达理想计划。
 */
export declare function registrationPlan(mode: GenerationMode): ModeRegistrationPlan;
export declare function modeFromFlag(proxyMode: boolean | undefined): GenerationMode;
/** 创建一个进程内总线实现（宿主行与测试共用）。 */
export declare function createProxyModeBus(read: {
    mode(): boolean | undefined;
    proxySettings(): {
        url?: string;
        bypass?: string;
    };
    modelSettings?(): {
        modelOverrides?: import('../settings.js').AntigravityHostConfig['modelOverrides'];
    };
}): ProxyModeBus & {
    notify(): void;
};
