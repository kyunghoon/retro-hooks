# Retro-Hooks

  (work in progress...)

  Are you stuck on an older version of react and unable to upgrade in order take advantage of hooks? This might be the repo for you.

  this repo attempts to create a similar hooks api with some minor caveats and workarounds

  min version of react tested on 16.0.0-alpha.6


### core implemented hooks (incomplete)

    - useState
    - useEffect
    - useRef
    - useMemo
    - useCallback
    - useContext (wip)

### additional tools

    - createContext


## small counter example (w/ react-native & typescript)

    // example in react-native

    import * as React from 'react';
    import { View, Text, Button } from 'react-native';
    import { withHooks, Hooks } from 'retro-hooks';

    // wrap a functional react component with `withHooks` to access the hooks api

    const MyComponent = withHooks<Props>(({ useState, useEffect, useRef }, props) => {

      const [counter, setCounter] = useState(0);

      useEffect(() => {
        console.log(`counter changed to ${counter}`);
      }, [counter]);

      return (
        <View>
          <Text>{counter}</Text>
          <Button onPress={() => setCounter(c => c + 1)} title="increment" />
        </View>
      );
    });


## useRedux implementation example (w/ react-native & typescript)

    /* ./useRedux.ts */

    import { Hooks } from 'retro-hooks';
    import { getReduxStore, RootState } from './my-store';
    import deepEquals from './deepequals';

    // notice that the hooks object given by `withHooks` must be explicitly passed to custom hooks

    export default <SubState>({ useRef, useState, useEffect }: Hooks, selectSubstate: (state: RootState) => SubState): SubState => {
      const [substate, setSubstate] = useState(() => selectSubstate(getReduxStore().getState()));
      const substateRef = useRef(substate);

      const checkForUpdates = () => {
        const nextSubstate = selectSubstate(getReduxStore().getState());
        if (!deepEquals(substateRef.current, nextSubstate)) {
          substateRef.current = nextSubstate;
          setSubstate(nextSubstate);
        }
      };

      useEffect(() => getReduxStore().subscribe(checkForUpdates), []);

      return substateRef.current;
    }


    /* ./app.ts */

    import useRedux from './useRedux.ts';

    const MyApp = (_props: {}) => {
      const mySubState = useRedux(rootReduxState => rootReduxState.subReduxState);
      return <View>{mySubState}</View>;
    }
