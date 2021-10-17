/**
 * targetMap = {
    [key: Object]: {
        [key: string]: Set<ReactiveEffect>
    }
}
 */

const targetMap = new WeakMap();
const reactiveMap = new WeakMap();
let activeEffect;

/**
 * 用于跟踪依赖
 */
function track (target, type, key) {
    if (activeEffect === undefined) return;
    let depsMap = targetMap.get(target);
    if (!depsMap) {
        targetMap.set(target, (depsMap = new Map()));
    }
    let dep = depsMap.get(key);
    if (!dep) {
        depsMap.set(key, (dep = new Set()))
    }
    dep.add(activeEffect);
}

/**
 * 触发依赖更新
 */
function trigger (target, type, key, newValue, oldValue, oldTarget) {
    const depsMap = targetMap.get(target);
    if (!depsMap) {
        return;
    }
    let deps = depsMap.get(key);
    deps.forEach(effect => effect.run())
}

/**
 * 创建响应式对象
 */
function reactive (target) {
    const existingProxy = reactiveMap.get(target);
    if (existingProxy) {
        return existingProxy;
    }
    const proxy = new Proxy(target, {
        get: (target, key, receiver) => {
            const res = Reflect.get(target, key, receiver);
            track(target, "get", key);
            return res;
        },
        set: (target, key, value, receiver) => {
            let oldValue = target[key];
            const res = Reflect.set(target, key, value, receiver);
            trigger(target, "set", key, value, oldValue);
            return res;
        },
        deleteProperty: (target, key) => {
            let oldValue = target[key]
            const res = Reflect.deleteProperty(target, key);
            trigger(target, key, undefined, oldValue);
            return res;
        },
        has: (target, key) => {
            const res = Reflect.has(target, key);
            track(target, "has", key);
            return res;
        }
    });
    reactiveMap.set(target, proxy);
    return proxy
}

class ReactiveEffect {
    constructor(fn) {
        this.fn = fn;
    }
    run () {
        activeEffect = this;
        this.fn();
        activeEffect = undefined;
    }
}

/**
 * 副作用函数
 */
function effect (fn) {
    const _effect = new ReactiveEffect(fn);
    _effect.run();
    const runner = _effect.run.bind(_effect);
    runner.effect = _effect;
    return runner;
}
