import * as React from 'react';

interface ReactComponentClass<P = {}> { new(props: P, context?: any): React.Component<P, {}>; }
type ReactComponent<P> = ReactComponentClass<P> | React.StatelessComponent<P>
type ReactChildren = null | false | JSX.Element;
type Obj<T extends {}> ={ [key: string]: T | undefined };

// [ CONTEXT ]
declare global {
  interface Object {
    is(a: any, b: any): boolean
  }
}
if (!Object.is) {
  Object.is = function(x, y) {
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
  useEffect: (fn: () => (() => void) | void, changvals?: any[]) => void,
  useRef: <T>(initialValue: T) => Ref<T>,
};

type Effect = { fn: () => (() => void) | void, cvars: any[] | undefined, changed: boolean };

export const withHooks = <P extends {}>(renderFn: (hooks: Hooks, props: P) => JSX.Element | null): ReactComponent<P> => {
  return class extends React.Component<P, {}> {
    effects = [] as Effect[];
    cleanup = [] as (() => void)[];
    references = {} as Obj<Ref<any>>;
    constructor(props: P) {
      super(props);
      let state = {} as Obj<any>;
      let si = 0;
      let ri = 0;
      this.effects = [];
      this.cleanup = [];
      this.references = {};
      renderFn({
        useEffect: (fn, cvars) => this.effects.push({ fn, cvars, changed: true }),
        useState: <T extends {}>(init: T | (() => T)) => {
          const key = si++;
          const value = init instanceof Function ? init() : init;
          state[key] = value;
          return [value, (v: T | ((t: T) => T)) => { }];
          //this.setState({ [key]: v instanceof Function ? v((this.state as any)[key]) : v });
          //}];
        },
        useRef: <T extends {}>(current: T) => {
          const ref = { current };
          this.references[ri++] = ref;
          return ref;
        }
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
      this.effects.forEach(({ fn, cvars, changed }) =>
        !cvars || cvars.length > 0 && changed && fn());
    }
    componentWillUnmount() {
      const cu = this.cleanup.reverse();
      this.cleanup = [];
      cu.forEach(fn => fn());
    }
    useState = <T extends {}>(key: number, init: T): [T, (t: T | ((t: T) => T)) => void] => {
      const value = this.state == undefined || (this.state as any)[key] == undefined ? init : (this.state as any)[key] as T;
      return [value, (v: T | ((t: T) => T)) => {
        this.setState({ [key]: v instanceof Function ? v((this.state as any)[key]) : v });
      }];
    }
    render() {
      let i = 0;
      let ri = 0;
      const nexteffects = [] as Effect[];
      const ret = renderFn({
        useEffect: (fn, cvars) => nexteffects.push({ fn, cvars, changed: false }),
        useState: init => this.useState(i++, init instanceof Function ? init() : init),
        useRef: <T extends {}>(_current: T) => this.references[ri++] as Ref<T>
      }, this.props);
      if (nexteffects.length != this.effects.length)
        throw new Error(`hook ordering has changed: ${nexteffects.length} != ${this.effects.length}`);
      this.effects = nexteffects.map((next, i) => {
        const { cvars: pcv } = this.effects[i];
        if (pcv) {
          if (!next.cvars || pcv.length != next.cvars.length)
            throw new Error(`useEffect variables have changed: ${!pcv ? 'NULL(1)' : !next.cvars ? 'NULL(2)' : `${pcv.length} != ${next.cvars.length}`}`);
          for (let i = 0; i < pcv.length; ++i)
            if (next.cvars && !Object.is(pcv[i], next.cvars[i]))
              return { ...next, changed: true };
        }
        return next;
      });
      return ret;
    }
  }
}
