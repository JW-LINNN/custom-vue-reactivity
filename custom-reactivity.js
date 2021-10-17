/**
 * Make a map and return a function for checking if a key
 * is in that map.
 * IMPORTANT: all calls of this function must be prefixed with
 * \/\*#\_\_PURE\_\_\*\/
 * So that rollup can tree-shake them if necessary.
 */

// * tips tree shaking
function makeMap (str, expectsLowerCase) {
    const map = Object.create(null);
    const list = str.split(',');
    for (let i = 0; i < list.length; i++) {
        map[list[i]] = true;
    }
    return expectsLowerCase ? val => !!map[val.toLowerCase()] : val => !!map[val];
}

// * tips 配置一些通用函数
Object.freeze({})
    ;
Object.freeze([]);
const extend = Object.assign;
const hasOwnProperty = Object.prototype.hasOwnProperty;
const hasOwn = (val, key) => hasOwnProperty.call(val, key);
const isArray = Array.isArray;
const isMap = (val) => toTypeString(val) === '[object Map]';
const isFunction = (val) => typeof val === 'function';
const isString = (val) => typeof val === 'string';
const isSymbol = (val) => typeof val === 'symbol';
const isObject = (val) => val !== null && typeof val === 'object';
const objectToString = Object.prototype.toString;
const toTypeString = (value) => objectToString.call(value);

// * tips 获取值的原始类型
const toRawType = (value) => {
    // extract "RawType" from strings like "[object RawType]"
    return toTypeString(value).slice(8, -1);
};
const isIntegerKey = (key) => isString(key) &&
    key !== 'NaN' &&
    key[0] !== '-' &&
    '' + parseInt(key, 10) === key;
const cacheStringFunction = (fn) => {
    const cache = Object.create(null);
    return ((str) => {
        const hit = cache[str];
        return hit || (cache[str] = fn(str));
    });
};
/**
 * @private
 */
const capitalize = cacheStringFunction((str) => str.charAt(0).toUpperCase() + str.slice(1));
// compare whether a value has changed, accounting for NaN.
const hasChanged = (value, oldValue) => !Object.is(value, oldValue);
const def = (obj, key, value) => {
    Object.defineProperty(obj, key, {
        configurable: true,
        enumerable: false,
        value
    });
};

function warn (msg, ...args) {
    console.warn(`[Vue warn] ${msg}`, ...args);
}




// ! effect 相关代码


let activeEffectScope;
const effectScopeStack = [];
class EffectScope {
    constructor(detached = false) {
        this.active = true;
        this.effects = [];
        this.cleanups = [];
        if (!detached && activeEffectScope) {
            this.parent = activeEffectScope;
            this.index =
                (activeEffectScope.scopes || (activeEffectScope.scopes = [])).push(this) - 1;
        }
    }
    run (fn) {
        if (this.active) {
            try {
                this.on();
                return fn();
            }
            finally {
                this.off();
            }
        }
        else {
            warn(`cannot run an inactive effect scope.`);
        }
    }
    on () {
        if (this.active) {
            effectScopeStack.push(this);
            activeEffectScope = this;
        }
    }
    off () {
        if (this.active) {
            effectScopeStack.pop();
            activeEffectScope = effectScopeStack[effectScopeStack.length - 1];
        }
    }
    stop (fromParent) {
        if (this.active) {
            this.effects.forEach(e => e.stop());
            this.cleanups.forEach(cleanup => cleanup());
            if (this.scopes) {
                this.scopes.forEach(e => e.stop(true));
            }
            // nested scope, dereference from parent to avoid memory leaks
            if (this.parent && !fromParent) {
                // optimized O(1) removal
                const last = this.parent.scopes.pop();
                if (last && last !== this) {
                    this.parent.scopes[this.index] = last;
                    last.index = this.index;
                }
            }
            this.active = false;
        }
    }
}
function effectScope (detached) {
    return new EffectScope(detached);
}
function recordEffectScope (effect, scope) {
    scope = scope || activeEffectScope;
    if (scope && scope.active) {
        scope.effects.push(effect);
    }
}
function getCurrentScope () {
    return activeEffectScope;
}
function onScopeDispose (fn) {
    if (activeEffectScope) {
        activeEffectScope.cleanups.push(fn);
    }
    else {
        warn(`onScopeDispose() is called when there is no active effect scope` +
            ` to be associated with.`);
    }
}

const createDep = (effects) => {
    const dep = new Set(effects);
    dep.w = 0;
    dep.n = 0;
    return dep;
};
const wasTracked = (dep) => (dep.w & trackOpBit) > 0;
const newTracked = (dep) => (dep.n & trackOpBit) > 0;
const initDepMarkers = ({ deps }) => {
    if (deps.length) {
        for (let i = 0; i < deps.length; i++) {
            deps[i].w |= trackOpBit; // set was tracked
        }
    }
};
const finalizeDepMarkers = (effect) => {
    const { deps } = effect;
    if (deps.length) {
        let ptr = 0;
        for (let i = 0; i < deps.length; i++) {
            const dep = deps[i];
            if (wasTracked(dep) && !newTracked(dep)) {
                dep.delete(effect);
            }
            else {
                deps[ptr++] = dep;
            }
            // clear bits
            dep.w &= ~trackOpBit;
            dep.n &= ~trackOpBit;
        }
        deps.length = ptr;
    }
};

const targetMap = new WeakMap();
// The number of effects currently being tracked recursively.
let effectTrackDepth = 0;
let trackOpBit = 1;
/**
 * The bitwise track markers support at most 30 levels op recursion.
 * This value is chosen to enable modern JS engines to use a SMI on all platforms.
 * When recursion depth is greater, fall back to using a full cleanup.
 */
const maxMarkerBits = 30;
const effectStack = [];
let activeEffect;
const ITERATE_KEY = Symbol('iterate');
const MAP_KEY_ITERATE_KEY = Symbol('Map key iterate');

// * tips 应该是存储响应式 触发事件的类？
class ReactiveEffect {
    constructor (fn, scheduler = null, scope) {
        this.fn = fn;
        this.scheduler = scheduler;
        this.active = true;
        this.deps = [];
        // todo 还不知道具体什么意思
        recordEffectScope(this, scope);
    }
    run() {
        if (!this.active) {
            return this.fn();
        }
        // * tips effectStack 存储副作用堆栈
        if (!effectStack.includes(this)) {
            try {
                effectStack.push((activeEffect = this));
                // todo 还不清楚
                enableTracking();
                trackOpBit = 1 << ++effectTrackDepth;
                if (effectTrackDepth <= maxMarkerBits) {
                    initDepMarkers(this);
                } else {
                    cleanupEffect(this);
                }
                return this.fn();
            }
            finally {
                // todo 不是很明白
                if (effectTrackDepth <= maxMarkerBits) {
                    finalizeDepMarkers(this);
                }
                trackOpBit = 1 << --effectTrackDepth;
                resetTracking();
                effectStack.pop();
                const n = effectStack.length;
                activeEffect = n > 0 ? effectStack[n - 1] : undefined;
            }
        }
    }
    stop() {
        if (this.active) {
            cleanupEffect(this);
            if (this.onStop) {
                this.onStop();
            }
            this.active = false;
        }
    }
}

function cleanupEffect (effect) {
    const  { deps } = effect;
    if (deps.length) {
        for(let i = 0; i < deps.length; i++) {
            deps[i].delete(effect);
        }
        deps.length = 0;
    }
}

function effect (fn, options) {
    if (fn.effect) {
        fn = fn.effect.fn;
    }
    const _effect = new ReactiveEffect(fn);
    if (options) {
        extend(_effect, options);
        if (options.scope) {
            recordEffectScope(_effect, options.scope);
        }
    }
    if (!options || !options.lazy) {
        _effect.run();
    }
    const runner = _effect.run.bind(_effect);
    runner.effect = _effect;
    return runner;
}

function stop (runner) {
    runner.effect.stop();
}

let shouldTrack = true;
const trackStack = []; // * 存储跟踪的响应式变量，但好像存储的都是 true / false

function pauseTracking () {
    trackStack.push(shouldTrack);
    shouldTrack = false;
}

function enableTracking () {
    trackStack.push(shouldTrack);
    shouldTrack = true;
}

function resetTracking () {
    const last = trackStack.pop();
    shouldTrack = last === undefined ? true : last;
}

function track (target, type, key) {
    if (!isTracking()) {
        return;
    }
    let depsMap = targetMap.get(target);
    if (!depsMap) {
        targetMap.set(target, (depsMap = new Map()));
    }
    let dep = depsMap.get(key);
    if (!dep) {
        depsMap.set(key, (dep = createDep()));
    }
    const eventInfo = {
        effect: activeEffect,
        target,
        type,
        key
    }
    trackEffects(dep, eventInfo);
}

function isTracking () {
    return shouldTrack && activeEffect !== undefined;
}

function trackEffects (dep, debuggerEventExtraInfo) {
    let shouldTrack = false;
    if (effectTrackDepth <= maxMarkerBits) {
        if (!newTracked(dep)) {
            dep.n |= trackOpBit;
            shouldTrack = !wasTracked(dep);
        }
    }
    else {
        shouldTrack = !dep.has(activeEffect);
    }
    if (shouldTrack) {
        dep.add(activeEffect);
        activeEffect.deps.push(dep);
        if (activeEffect.onTrack) {
            activeEffect.onTrack(Object.assign({
                effect: activeEffect
            }, debuggerEventExtraInfo));
        }
    }
}

function trigger(target, type, key, newValue, oldValue, oldTarget) {
    const depsMap = targetMap.get(target);
    if (!depsMap) {
        return;
    }
    let deps = [];
    if (type === "clear") {
        deps = [...depsMap.values()];
    }
    // * 当数组 length 属性修改时的处理方案
    else if (key === 'length' && isArray(target)) {
        depsMap.forEach((dep, key) => {
            if (key === 'length' || key >= newValue) {
                deps.push(dep);
            }
        })
    }
    else {
        if (key !== void 0) {
            deps.push(depsMap.get(key));
        }
        switch (type) {
            case "add":
                if (!isArray(target)) {
                    deps.push(depsMap.get(ITERATE_KEY));
                    if (isMap(target)) {
                        deps.push(depsMap.get(MAP_KEY_ITERATE_KEY));
                    }
                }
                else if (isIntegerKey(key)) {
                    deps.push(depsMap.get('length'));
                }
                break;
            case "delete":
                if (!isArray(target)) {
                    deps.push(depsMap.get(ITERATE_KEY));
                    if (isMap(target)) {
                        deps.push(depsMap.get(MAP_KEY_ITERATE_KEY));
                    }
                }
                break;
            case "set":
                if (isMap(target)) {
                    deps.push(depsMap.get(ITERATE_KEY));
                }
                break;
        }
    }
    const eventInfo = { target, type, key, newValue, oldValue, oldTarget }
    if (deps.length === 1) {
        if (deps[0]) {
            triggerEffects(deps[0], eventInfo);
        }
    }
    else {
        const effects = [];
        for (const dep of deps) {
            if (dep) {
                effects.push(...dep);
            }
        }
        {
            triggerEffects(createDep(effects), eventInfo);
        }
    }

}

function triggerEffects (dep, debuggerEventExtraInfo) {
    for (const effect of isArray(dep) ? dep : [...dep]) {
        if (effect.onTrigger) {
            effect.onTrigger(extend({ effect }, debuggerEventExtraInfo));
        }
        if (effect.scheduler) {
            effect.scheduler();
        }
        else {
            effect.run();
        }
    }
}
const mutableCollectionHandlers = {
    // get: /*#__PURE__*/ createInstrumentationGetter(false, false)
};

const reactiveMap = new WeakMap();
const shallowReactiveMap = new WeakMap();
const readonlyMap = new WeakMap();
const shallowReadonlyMap = new WeakMap();
function targetTypeMap (rawType) {
    switch (rawType) {
        case 'Object':
        case 'Array':
            return 1 /* COMMON */;
        case 'Map':
        case 'Set':
        case 'WeakMap':
        case 'WeakSet':
            return 2 /* COLLECTION */;
        default:
            return 0 /* INVALID */;
    }
}
function getTargetType (value) {
    return value["__v_skip" /* SKIP */] || !Object.isExtensible(value)
        ? 0 /* INVALID */
        : targetTypeMap(toRawType(value));
}


// ! effect 相关代码 👆



const isNonTrackableKeys = /*#__PURE__*/ makeMap(`__proto__,__v_isRef,__isVue`);
const builtInSymbols = new Set(Object.getOwnPropertyNames(Symbol)
    .map(key => Symbol[key])
    .filter(isSymbol));
// * tips proxy handler getters
const get = createGetter();
function createGetter (isReadonly = false, shallow = false) {
    return function get (target, key, receiver) {
        // * 这几个key应该都是创建proxy对象时新增的，直接获取属性返回
        if (key === "__v_isReactive") {
            return !isReadonly;
        }
        else if (key === "__v_isReadonly") {
            return isReadonly;
        }
        // * 获取原对象
        else if (key === "__v_raw" &&
            receiver ===
            (isReadonly
                ? shallow
                    ? shallowReadonlyMap
                    : readonlyMap
                : shallow
                    ? shallowReactiveMap
                    : reactiveMap).get(target)) {
            return target;
        }

        const targetIsArray = isArray(target);
        if (!isReadonly && targetIsArray && hasOwn(arrayInstrumentations, key)) {
            return Reflect.get(arrayInstrumentations, key, receiver);
        }

        const res = Reflect.get(target, key, receiver);

        if (isSymbol(key) ? builtInSymbols.has(key) : isNonTrackableKeys(key)) {
            return res;
        }

        // * tips 如果不是只读，意味着之后该值可能会改变，需要进行跟踪
        if (!isReadonly) {
            track(target, "get" /* GET */, key);
        }

        // * tips 区分是否 shallow isRef isObject 即是否复杂结构，对象内部又是ref/对象，递归拆解
        if (shallow) {
            return res;
        }
        // if (isRef(res)) {
        //     // ref unwrapping - does not apply for Array + integer key.
        //     const shouldUnwrap = !targetIsArray || !isIntegerKey(key);
        //     return shouldUnwrap ? res.value : res;
        // }

        if (isObject(res)) {
            // Convert returned value into a proxy as well. we do the isObject check
            // here to avoid invalid value warning. Also need to lazy access readonly
            // and reactive here to avoid circular dependency.
            return isReadonly ? readonly(res) : reactive(res);
        }
        return res;
    }
}
const arrayInstrumentations = createArrayInstrumentations();
// * 对数组结构部分操作进行改写
function createArrayInstrumentations () {
    const instrumentations = {};
    ['includes', 'indexOf', 'lastIndexOf'].forEach(key => {
        instrumentations[key] = function (...args) {
            // * 获取原生数组
            const arr = toRaw(this);
            for (let i = 0, l = this.length; i < l; i++) {
                track(arr, "get", /* GET */ i + '');
            }
            // * 获取返回结果
            const res = arr[key](...args);
            if (res === -1 || res === false) {
                return arr[key](...args.map(toRaw));
            } else {
                return res;
            }
        }
    });
    ['push', 'pop', 'shift', 'unshift', 'splice'].forEach(key => {
        instrumentations[key] = function (...args) {
            pauseTracking();
            const res = toRaw(this)[key].apply(this, args);
            resetTracking();
            return res;
        }
    });
    return instrumentations;
}

// * tips proxy handler setters
const set = /*#__PURE__*/ createSetter();
function createSetter(shallow = false) {
    return function set(target, key, value, receiver) {
        let oldValue = target[key];
        if (!shallow) {
            value = toRaw(value);
            oldValue = toRaw(oldValue);
            if (!isArray(target) && isRef(oldValue) && !isRef(value)) {
                oldValue.value = value;
                return true;
            }
        }
        const hadKey = isArray(target) && isIntegerKey(key)
            ? Number(key) < target.length
            : hasOwn(target, key);
        const result = Reflect.set(target, key, value, receiver);

        // todo 还未知这里具体判断什么
        // don't trigger if target is something up in the prototype chain of original
        if (target === toRaw(receiver)) {
            // * 根据之前是否该key trigger触发时，传入不同的参数
            if (!hadKey) {
                trigger(target, 'add' /* ADD */, key, value);
            }
            else if (hasChanged(value, oldValue)) {
                trigger(target, 'set' /* SET */, key, value, oldValue);
            }
        }
        return result;
    }
}

// * tips proxy handler deleteProperty
function deleteProperty(target, key) {
    const hadKey = hasOwn(target, key);
    const oldValue = target[key];
    const result = Reflect.deleteProperty(target, key);
    if (result && hadKey) {
        // * 删除属性也需要触发tirgger
        trigger(target, 'delete' /* DELETE */, key, undefined, oldValue);
    }
    return result;
}

// * tips proxy handlers has
function has(target, key) {
    const result = Reflect.has(target, key);
    if (!isSymbol(key) || !builtInSymbols.has(key)) {
        // * has 操作需要触发依赖收集
        track(target, "has" /* HAS */, key);
    }
    return result;
}

// * tips proxy handlers ownKeys
function ownKeys(target) {
    track(target, "iterate" /* ITERATE */, isArray(target) ? 'length' : ITERATE_KEY);
    return Reflect.ownKeys(target);
}

// * 下方时候别名为 baseHandlers，作为创建proxy对象的第二个传参
const mutableHandlers = {
    get,
    set,
    deleteProperty,
    has,
    ownKeys
}


// * tips reactive 入口
function reactive (target) {
    // if trying to observe a readonly proxy, return the readonly version.
    if (target && target["__v_isReadonly" /* IS_READONLY */]) {
        return target;
    }
    return createReactiveObject(target, false, mutableHandlers, mutableCollectionHandlers, reactiveMap);
}
/**
 * Return a shallowly-reactive copy of the original object, where only the root
 * level properties are reactive. It also does not auto-unwrap refs (even at the
 * root level).
 */
function shallowReactive (target) {
    return createReactiveObject(target, false, shallowReactiveHandlers, shallowCollectionHandlers, shallowReactiveMap);
}
/**
 * Creates a readonly copy of the original object. Note the returned copy is not
 * made reactive, but `readonly` can be called on an already reactive object.
 */
function readonly (target) {
    return createReactiveObject(target, true, readonlyHandlers, readonlyCollectionHandlers, readonlyMap);
}
/**
  * Returns a reactive-copy of the original object, where only the root level
  * properties are readonly, and does NOT unwrap refs nor recursively convert
  * returned properties.
  * This is used for creating the props proxy object for stateful components.
  */
function shallowReadonly (target) {
    return createReactiveObject(target, true, shallowReadonlyHandlers, shallowReadonlyCollectionHandlers, shallowReadonlyMap);
}

// * tips reactive 内部调用函数
function createReactiveObject (target, isReadonly, baseHandlers, collectionHandlers, proxyMap) {
    if (!isObject(target)) {
        console.warn('不是对象啊喂！')
        return target;
    }
    const existingProxy = proxyMap.get(target);
    if (existingProxy) {
        return existingProxy;
    }

    // * 获取target类型，区分为三种类型
    /** 
     * * Object | Array  1
     * * Set | Map | WeakMap | WeakSet 2
     * * invalid 非法类型 0
     */
    const targetType = getTargetType(target);

    // * 非法类型直接返回
    if (targetType === 0) {
        return target
    }

    // * 根据类型不同，proxy使用不同的handler
    const proxy = new Proxy(target, targetType === 2 ? collectionHandlers : baseHandlers);

    // * 新建完proxy之后，存入proxyMap，与上方的existingProxy对应
    proxyMap.set(target, proxy);
    return proxy;
}
function toRaw(observed) {
    const raw = observed && observed["__v_raw" /* RAW */];
    return raw ? toRaw(raw) : observed;
}