/**
 * 模式 → 注册计划。代理行未装载（服务缺失）时由调用方把 proxy 降为 false；
 * 这只表示代理路由不在册，ACP 仍按请求的模式保持注销，不回退。本函数只表达理想计划。
 */
export function registrationPlan(mode) {
    return mode === 'proxy' ? { acp: false, proxy: true } : { acp: true, proxy: false };
}
export function modeFromFlag(proxyMode) {
    return proxyMode === true ? 'proxy' : 'acp';
}
/** 创建一个进程内总线实现（宿主行与测试共用）。 */
export function createProxyModeBus(read) {
    const listeners = new Set();
    let ready = false;
    let last = false;
    const notify = () => {
        const next = read.mode() === true;
        if (next === last)
            return;
        last = next;
        for (const listener of [...listeners])
            listener(next);
    };
    return {
        current: () => read.mode() === true,
        requested: () => read.mode() === true,
        routerReady: () => ready,
        setRouterReady(value) { ready = value; notify(); },
        subscribe(listener) {
            listeners.add(listener);
            return () => { listeners.delete(listener); };
        },
        proxySettings: () => read.proxySettings(),
        modelSettings: () => read.modelSettings?.() ?? {},
        notify,
    };
}
//# sourceMappingURL=mode-bus.js.map