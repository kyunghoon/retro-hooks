import * as React from 'react';

interface ReactComponentClass<P = {}> { new(props: P, context?: any): React.Component<P, {}>; }
type ReactComponent<P> = ReactComponentClass<P> | React.StatelessComponent<P>
type ReactChildren = null | false | JSX.Element;
type Obj<T extends unknown> = { [key: string]: T | undefined };

let _lastSetStateTime = new Date().getTime();
let _numSetStates = 0;

// [ CONTEXT ]
declare global {
  interface Object {
    is(a: any, b: any): boolean
  }
}
if (!Object.is) {
  Object.is = function (x, y) { return x === y ? x !== 0 || 1 / x === 1 / y : x !== x && y !== y; };
}

export type ProviderProps<T> = { value: T, children: ReactChildren };
export type ConsumerProps<T> = { children: (t: T) => ReactChildren };
type ContextValue<T> = { ciid: number, getValue: () => T; subscribe: (fn: () => void) => () => void };
let _contextClassIdCounter = 0;
let _contextInstanceIdCounter = 0;

export type Context<T> = {
  Provider: React.ComponentClass<any>,
  Consumer: React.ComponentClass<any>,
  initialValue: T
};

const _contexts: Obj<{ subs: (() => void)[], value: any }> = {};

export const createContext = <T extends unknown>(initialValue: T, config?: { sharedProviderState?: boolean }) => {
  const issharedstate = config && config.sharedProviderState;
  const contextClassId = ++_contextClassIdCounter;
  return {
    Provider: class Provider extends React.Component<ProviderProps<T>> {
      static childContextTypes = { ccid: React.PropTypes.number, getValue: React.PropTypes.func, subscribe: React.PropTypes.func };
      static ctxClassId = contextClassId;
      _cid = ++_contextInstanceIdCounter;
      static currInstanceId = 0;
      constructor(props: ProviderProps<T>) {
        super(props);
        _contexts[this._cid] = {
          subs: [] as (() => void)[],
          value: props.value,
        };
      }
      getChildContext = () => ({
        ccid: this._cid,
        getValue: () => {
          const ctx = _contexts[this._cid];
          return !ctx ? initialValue : ctx.value;
        },
        subscribe: (fn: () => void) => {
          const ctx = _contexts[this._cid];
          if (!ctx || !ctx.subs) throw new Error('invalid context state');
          ctx.subs.push(fn);
          return () => ctx.subs = ctx.subs.filter(i => i !== fn);
        }
      });
      componentDidUpdate(prevProps: ProviderProps<T>) {
        const ctx = _contexts[this._cid];
        if (ctx) {
          ctx.value = this.props.value;
          !Object.is(prevProps.value, this.props.value) && ctx.subs.forEach(fn => fn());
          console.log(this._cid, ctx);
        }
      }
      render() {
        Provider.currInstanceId = this._cid;
        console.log('CTX = ', this._cid);
        return this.props.children;
      }
    },
    Consumer: class extends React.Component<ConsumerProps<T>> {
      context!: ContextValue<T>;
      static contextTypes = { ccid: React.PropTypes.number, getValue: React.PropTypes.func, subscribe: React.PropTypes.func };
      static ctxClassId = contextClassId;
      unsub = undefined as (() => void) | undefined;
      componentDidMount() { this.unsub = this.context.subscribe(() => this.forceUpdate()); }
      componentWillUnmount() { this.unsub && this.unsub(); this.unsub = undefined; }
      render() { return this.props.children(this.context.getValue && this.context.getValue() || initialValue); }
    },
    initialValue
  }

  //return { Provider, Consumer, initialValue };
}

// [ HOOKS ]

export type Ref<T> = { current: T };

export type Hooks = {
  useState: <T>(initialValue: T | (() => T)) => [T, (v: T | ((t: T) => T)) => void],
  useEffect: (fn: () => (() => void) | void, inputs?: any[]) => void,
  useRef: <T>(initialValue: T) => Ref<T>,
  useMemo: <R>(fn: () => R, inputs?: any[]) => R,
  useCallback: <Fn extends unknown>(fn: Fn, inputs?: any[]) => Fn,
  useContext: <T>(context: Context<T>) => T
};

type Effect = { fn: () => (() => void) | void, inputs: any[] | undefined, changed: boolean };
type Memo = { fn: () => any, inputs?: any[] | undefined };

export const withHooks = <P extends unknown>(renderFn: (hooks: Hooks, props: P) => JSX.Element | null): ReactComponent<P> => {
  return class extends React.Component<P, {}> {
    context!: ContextValue<any>;
    static contextTypes = { ciid: React.PropTypes.number, getValue: React.PropTypes.func, subscribe: React.PropTypes.func };
    unsubs = undefined as (() => void)[] | undefined;
    effects = [] as Effect[];
    cleanup = [] as (() => void)[];
    references = {} as Obj<Ref<any>>;
    memos = [] as Memo[];
    ctxs = [] as Context<any>[];
    constructor(props: P, context: any) {
      super(props);
      let state = {} as Obj<any>;
      let si = 0;
      let ri = 0;
      this.effects = [];
      this.cleanup = [];
      this.references = {};
      this.memos = [];
      this.ctxs = [];
      const useMemo = <R extends unknown>(fn: () => R, inputs?: any[]) => {
        this.memos.push({ fn, inputs });
        return fn();
      };
      renderFn({
        useEffect: (fn, inputs) => this.effects.push({ fn, inputs, changed: true }),
        useState: <T extends unknown>(init: T | (() => T)) => {
          const key = si++;
          const value = init instanceof Function ? init() : init;
          state[key] = value;
          return [value, (v: T | ((t: T) => T)) => { }];
        },
        useRef: <T extends unknown>(current: T) => {
          const ref = { current };
          this.references[ri++] = ref;
          return ref;
        },
        useMemo,
        useCallback: <Fn extends unknown>(fn: Fn, inputs?: any[]): Fn => useMemo(() => fn, inputs),
        useContext: <T extends unknown>(c: Context<T>): T => {
          this.ctxs.push(c);
          const ciid = (c.Provider as any).currInstanceId;
          const ctx = ciid && _contexts[ciid];
          return ctx && ctx.value || c.initialValue;
        },
      }, props);
      this.state = state;
    }
    componentDidMount() {
      this.unsubs = this.ctxs.map((c: any) => {
        const ciid = (c.Provider as any).currInstanceId;
        const ctx = ciid && _contexts[ciid];
        if (!ctx) return () => {};
        const fn = () => this.forceUpdate();
        ctx.subs.push(fn);
        return () => ctx.subs = ctx.subs.filter(i => i !== fn);
      });
      const nextcleanup = [] as (() => void)[];
      this.effects.forEach(({ fn }) => {
        const ret = fn();
        ret instanceof Function && nextcleanup.push(ret);
      });
      this.cleanup = nextcleanup;
    }
    componentDidUpdate() {
      this.effects.forEach(({ fn, inputs, changed }) =>
        !inputs || inputs.length > 0 && changed && fn());
    }
    componentWillUnmount() {
      const cu = this.cleanup.reverse();
      this.cleanup = [];
      cu.forEach(fn => fn());
      this.unsubs && this.unsubs.forEach((u: any) => u && u());
      this.unsubs = undefined;
    }
    useState = <T extends unknown>(key: number, init: T): [T, (t: T | ((t: T) => T)) => void] => {
      const value = this.state == undefined || (this.state as any)[key] == undefined ? init : (this.state as any)[key] as T;
      return [value, (v: T | ((t: T) => T)) => {
        const now = new Date().getTime();
        const dt = now - _lastSetStateTime;
        _numSetStates = dt > 50 ? 0 : _numSetStates + 1;
        _lastSetStateTime = now;
        if (_numSetStates > 60) {
          console.warn(`setState is being spammed ${dt} (${_numSetStates})`);
          _numSetStates = 0;
        }
        this.setState({ [key]: v instanceof Function ? v((this.state as any)[key]) : v });
      }];
    }
    useMemo = <T extends unknown>(nextmemos: Memo[], fn: () => T, inputs?: any[]): T => {
      try {
        if (nextmemos.length > this.memos.length)
          throw new Error(`hook memos ordering mismatch ${nextmemos.length} > ${this.memos.length}`);
        const prev = this.memos[nextmemos.length];
        if (!inputs || inputs.length == 0 || inputsEquals(prev.inputs, inputs, 'memo')) {
          const pfn = prev.fn || fn; // keep same
          nextmemos.push({ fn: pfn, inputs });
          return pfn() as T;
        } else {
          nextmemos.push({ fn, inputs }); // changed
          return fn() as T;
        }
      } catch (err) {
        console.error(err);
        throw err;
      }
    }
    render() {
      let i = 0;
      let ri = 0;
      const nexteffects = [] as Effect[];
      const nextmemos = [] as Memo[];
      const ret = renderFn({
        useEffect: (fn, inputs) => nexteffects.push({ fn, inputs, changed: false }),
        useState: init => this.useState(i++, init instanceof Function ? init() : init),
        useRef: <T extends unknown>(_current: T) => this.references[ri++] as Ref<T>,
        useMemo: <T extends unknown>(fn: () => T, inputs?: any[]) => this.useMemo(nextmemos, fn, inputs),
        useCallback: <Fn extends unknown>(fn: Fn, inputs?: any[]) => this.useMemo(nextmemos, () => fn, inputs),
        useContext: <T extends unknown>(c: Context<T>): T => {
          const ciid = (c.Provider as any).currInstanceId;
          const ctx = ciid && _contexts[ciid];
          return ctx && ctx.value || c.initialValue;
        },
      }, this.props);
      if (nextmemos.length != this.memos.length)
        throw new Error(`hook memos ordering has changed: ${nextmemos.length} != ${this.memos.length}`);
      if (nexteffects.length != this.effects.length)
        throw new Error(`hook effects ordering has changed: ${nexteffects.length} != ${this.effects.length}`);
      this.effects = nexteffects.map((next, i) => ({ ...next, changed: !inputsEquals(this.effects[i].inputs, next.inputs, 'effect') }));
      this.memos = nextmemos;
      return ret;
    }
  }
}

const inputsEquals = (previnputs: any[] | undefined, nextinputs: any[] | undefined, debugString?: string) => {
  if (previnputs) {
    if (!nextinputs || previnputs.length != nextinputs.length)
      throw new Error(`${debugString} variables have changed: ${!previnputs ? 'NULL(1)' : !nextinputs ? 'NULL(2)' : `${previnputs.length} != ${nextinputs.length}`}`);
    for (let i = 0; i < previnputs.length; ++i)
      if (nextinputs && !Object.is(previnputs[i], nextinputs[i]))
        return false;
  }
  return true;
}
