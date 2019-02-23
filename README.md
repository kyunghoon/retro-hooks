# Retro-Hook

## Are you stuck on an older version of react and unable to upgrade to order take advantage of hooks? this might be the repo for you!

  this repo attempts to create a similar hooks api with some minor caveats and workarounds

  min version of react tested on 16.0.0-alpha.6


### core implemented hooks (incomplete)

    - useState
    - useEffect
    - useRef

### additional tools

    - createContext


## small counter example

    // example in react-native

    import * as React from 'react';
    import { View } from 'react-native';
    import { withHooks, useEffect } from 'retro-hooks';

    // wrap a function react component with `withHooks` to access the api

    const MyComponent = withHooks({ useState, useEffect, useRef }, props => {

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


## useRedux implementation example (in typescript)

    // ./useRedux.ts

    import { Hooks } from 'retro-hooks';
    import { getReduxStore, RootState } from '../my-store';
    import deepEquals from 'deepequals';

    // notice, the hooks object given by `withHooks` must be passed in to custom hooks
    export default <SubState>({ useState, useEffect, useRef }: Hooks, selectSubstate: (state: RootState) => SubState): SubState => {
      const [substate, setSubstate] = useState<SubState>(() => {
        const state = getReduxStore().getState();
        return selectSubstate(state);
      });

      const prevSubstateRef = useRef<SubState | null>(null);
      useEffect(() => {
        prevSubstateRef.current = substate;
      });

      const checkForUpdates = () => {
        const nextState = getReduxStore().getState();
        const nextSubstate = selectSubstate(nextState);
        if (!deepEquals(prevSubstateRef.current, nextSubstate)) {
          setSubstate(nextSubstate);
        }
      };

      useEffect(() => getReduxStore().subscribe(checkForUpdates), []);

      return substate;
    }


    // ./app.ts
    import useRedux from './useRedux.ts';

    const MyApp = (_props: {}) => {
      const mySubState = useRedux(rootReduxState => rootReduxState.subReduxState);
      return <View>{mySubState}</View>;
    }

    ... etc


