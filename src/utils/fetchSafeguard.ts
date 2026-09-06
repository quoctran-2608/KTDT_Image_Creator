/**
 * Safeguard for environments (e.g. preview iframes, WebViews, browser extensions)
 * where window.fetch or Window.prototype.fetch is configured with only a getter
 * without a setter, which causes "TypeError: Cannot set property fetch of #<Window> which has only a getter"
 * when any library or script attempts to assign window.fetch.
 */
(function initFetchSafeguard() {
  if (typeof window === 'undefined') return;

  function patchDescriptor(prop: string | number | symbol, descriptor?: PropertyDescriptor): PropertyDescriptor | undefined {
    if (prop === 'fetch' && descriptor && typeof descriptor.get === 'function' && typeof descriptor.set === 'undefined') {
      let customVal: any = undefined;
      const origGet = descriptor.get;
      descriptor.set = function(v: any) {
        customVal = v;
      };
      descriptor.get = function() {
        return customVal !== undefined ? customVal : origGet.call(this);
      };
      descriptor.configurable = true;
    }
    return descriptor;
  }

  // 1. Intercept future Object.defineProperty calls
  try {
    const origDefineProp = Object.defineProperty;
    Object.defineProperty = function(obj: any, prop: any, descriptor: any) {
      return origDefineProp.call(Object, obj, prop, patchDescriptor(prop, descriptor));
    };
  } catch (e) {}

  // 2. Intercept future Reflect.defineProperty calls
  try {
    if (typeof Reflect !== 'undefined' && Reflect.defineProperty) {
      const origReflectDefineProp = Reflect.defineProperty;
      Reflect.defineProperty = function(target: any, prop: any, descriptor: any) {
        return origReflectDefineProp.call(Reflect, target, prop, patchDescriptor(prop, descriptor));
      };
    }
  } catch (e) {}

  // 3. Fix any pre-existing getter-only fetch on window or Window.prototype
  try {
    const targets = [
      window,
      window.constructor ? (window.constructor as any).prototype : null,
      Object.getPrototypeOf(window),
    ].filter(Boolean);

    for (const target of targets) {
      try {
        const desc = Object.getOwnPropertyDescriptor(target, 'fetch');
        if (desc && desc.get && typeof desc.set === 'undefined') {
          let customVal: any = undefined;
          const origGet = desc.get;
          Object.defineProperty(target, 'fetch', {
            get() {
              return customVal !== undefined ? customVal : origGet.call(this);
            },
            set(v) {
              customVal = v;
            },
            configurable: true,
            enumerable: desc.enumerable ?? true,
          });
        }
      } catch (e) {}
    }
  } catch (e) {}
})();

export {};
