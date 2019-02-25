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
  Object.is = function (x, y) {
    if (x === y) {
      return x !== 0 || 1 / x === 1 / y;
    } else {
      return x !== x && y !== y;
    }
  };
}

export type ProviderProps<T> = { value: T, children: ReactChildren };
export type ConsumerProps<T> = { children: (t: T) => ReactChildren };
export type Context<T> = { getValue: () => T; subscribe: (fn: () => void) => () => void };
export const createContext = <T extends unknown>(initialValue: T) => {
  return {
    Provider: class extends React.PureComponent<ProviderProps<T>> {
      static childContextTypes = { getValue: React.PropTypes.func, subscribe: React.PropTypes.func };
      subs = [] as (() => void)[];
      getChildContext = () => ({
        getValue: () => this.props.value,
        subscribe: (fn: () => void) => {
          this.subs.push(fn);
          return () => this.subs = this.subs.filter(i => i !== fn);
        }
      });
      componentDidUpdate(prevProps: ProviderProps<T>) { !Object.is(prevProps.value, this.props.value) && this.subs.forEach(fn => fn()); }
      render() { return this.props.children; }
    },
    Consumer: class extends React.PureComponent<ConsumerProps<T>> {
      context!: Context<T>;
      static contextTypes = { getValue: React.PropTypes.func, subscribe: React.PropTypes.func };
      unsub = undefined as (() => void) | undefined;
      componentDidMount() { this.unsub = this.context.subscribe(() => this.forceUpdate()); }
      componentWillUnmount() { this.unsub && this.unsub(); this.unsub = undefined; }
      render() { return this.props.children(this.context.getValue && this.context.getValue() || initialValue); }
    }
  };
}


// [ HOOKS ]

export type Ref<T> = { current: T };

export type Hooks = {
  useState: <T>(initialValue: T | (() => T)) => [T, (v: T | ((t: T) => T)) => void],
  useEffect: (fn: () => (() => void) | void, inputs?: any[]) => void,
  useRef: <T>(initialValue: T) => Ref<T>,
  useMemo: <R>(fn: () => R, inputs?: any[]) => R,
  useCallback: <Fn extends unknown>(fn: Fn, inputs?: any[]) => Fn
};

type Effect = { fn: () => (() => void) | void, inputs: any[] | undefined, changed: boolean };
type Memo = { fn: () => any, inputs?: any[] | undefined };

export const withHooks = <P extends unknown>(renderFn: (hooks: Hooks, props: P) => JSX.Element | null): ReactComponent<P> => {
  return class extends React.Component<P, {}> {
    effects = [] as Effect[];
    cleanup = [] as (() => void)[];
    references = {} as Obj<Ref<any>>;
    memos = [] as Memo[];
    constructor(props: P) {
      super(props);
      let state = {} as Obj<any>;
      let si = 0;
      let ri = 0;
      this.effects = [];
      this.cleanup = [];
      this.references = {};
      this.memos = [];
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
        useCallback: <Fn extends unknown>(fn: Fn, inputs?: any[]): Fn => useMemo(() => fn, inputs)
      }, props);
      this.state = state;
    }
    componentDidMount() {
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
        useCallback: <Fn extends unknown>(fn: Fn, inputs?: any[]) => this.useMemo(nextmemos, () => fn, inputs)
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