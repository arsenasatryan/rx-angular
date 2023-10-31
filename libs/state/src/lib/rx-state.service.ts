import {
  computed,
  inject,
  Injectable,
  Injector,
  isSignal,
  OnDestroy,
  Signal,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
// eslint-disable-next-line @nx/enforce-module-boundaries
import {
  AccumulationFn,
  createAccumulationObservable,
  createSideEffectObservable,
  isKeyOf,
  KeyCompareMap,
  PickSlice,
  safePluck,
  select,
} from '@rx-angular/state/selections';
import {
  EMPTY,
  isObservable,
  Observable,
  Subscribable,
  Subscription,
  Unsubscribable,
  type OperatorFunction,
} from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { createSignalStateProxy, SignalStateProxy } from './signal-state-proxy';

export type ProjectStateFn<T> = (oldState: T) => Partial<T>;
export type ProjectValueFn<T, K extends keyof T> = (oldState: T) => T[K];

export type ProjectStateReducer<T, V> = (oldState: T, value: V) => Partial<T>;

export type ProjectValueReducer<T, K extends keyof T, V> = (
  oldState: T,
  value: V
) => T[K];

/**
 * @description
 * RxState is a light-weight reactive state management service for managing local state in angular.
 *
 * @example
 * Component({
 *   selector: 'app-stateful',
 *   template: `<div>{{ state$ | async | json }}</div>`,
 *   providers: [RxState]
 * })
 * export class StatefulComponent {
 *   readonly state$ = this.state.select();
 *
 *   constructor(private state: RxState<{ foo: string }>) {}
 * }
 *
 * @docsCategory RxState
 * @docsPage RxState
 */
@Injectable()
export class RxState<T extends object> implements OnDestroy, Subscribable<T> {
  private subscription = new Subscription();

  private accumulator = createAccumulationObservable<T>();
  private effectObservable = createSideEffectObservable();

  private readonly injector = inject(Injector);

  private signalStoreProxy: SignalStateProxy<T>;

  /**
   * @description
   * The unmodified state exposed as `Observable<T>`. It is not shared, distinct or gets replayed.
   * Use the `$` property if you want to read the state without having applied {@link stateful} to it.
   */
  readonly $: Observable<T> = this.accumulator.signal$;

  /**
   * @internal
   */
  constructor() {
    this.subscription.add(this.subscribe());
  }

  /**
   * @internal
   */
  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  /**
   * @description
   *
   * Allows to customize state accumulation function.
   * This can be helpful to implement deep updates and tackle other immutability problems in a custom way.
   * @example
   *
   * ```typescript
   * const myAccumulator = (state: MyState, slice: Partial<MyState>) => deepCopy(state, slice);
   *
   * this.state.setAccumulator(myAccumulator);
   * ```
   */
  setAccumulator(accumulatorFn: AccumulationFn): void {
    this.accumulator.nextAccumulator(accumulatorFn);
  }

  /**
   * @description
   * Read from the state in imperative manner. Returns the state object in its current state.
   *
   * @example
   * const { disabled } = state.get();
   * if (!disabled) {
   *   doStuff();
   * }
   *
   * @return T
   */
  get(): T;

  /**
   * @description
   * Read from the state in imperative manner by providing keys as parameters.
   * Returns the part of state object.
   *
   * @example
   * // Access a single property
   *
   * const bar = state.get('bar');
   *
   * // Access a nested property
   *
   * const foo = state.get('bar', 'foo');
   *
   * @return T | T[K1] | T[K1][K2]
   */

  get<K1 extends keyof T>(k1: K1): T[K1];
  /** @internal **/
  get<K1 extends keyof T, K2 extends keyof T[K1]>(k1: K1, k2: K2): T[K1][K2];
  /** @internal **/
  get<K1 extends keyof T, K2 extends keyof T[K1], K3 extends keyof T[K1][K2]>(
    k1: K1,
    k2: K2,
    k3: K3
  ): T[K1][K2][K3];
  /** @internal **/
  get<
    K1 extends keyof T,
    K2 extends keyof T[K1],
    K3 extends keyof T[K1][K2],
    K4 extends keyof T[K1][K2][K3]
  >(k1: K1, k2: K2, k3: K3, k4: K4): T[K1][K2][K3][K4];
  /** @internal **/
  get<
    K1 extends keyof T,
    K2 extends keyof T[K1],
    K3 extends keyof T[K1][K2],
    K4 extends keyof T[K1][K2][K3],
    K5 extends keyof T[K1][K2][K3][K4]
  >(k1: K1, k2: K2, k3: K3, k4: K4, k5: K5): T[K1][K2][K3][K4][K5];
  /** @internal **/
  get<
    K1 extends keyof T,
    K2 extends keyof T[K1],
    K3 extends keyof T[K1][K2],
    K4 extends keyof T[K1][K2][K3],
    K5 extends keyof T[K1][K2][K3][K4],
    K6 extends keyof T[K1][K2][K3][K4][K5]
  >(k1: K1, k2: K2, k3: K3, k4: K4, k5: K5, k6: K6): T[K1][K2][K3][K4][K5][K6];
  /** @internal **/
  get<
    K1 extends keyof T,
    K2 extends keyof T[K1],
    K3 extends keyof T[K1][K2],
    K4 extends keyof T[K1][K2][K3],
    K5 extends keyof T[K1][K2][K3][K4],
    K6 extends keyof T[K1][K2][K3][K4][K5]
  >(
    ...keys:
      | [K1]
      | [K1, K2]
      | [K1, K2, K3]
      | [K1, K2, K3, K4]
      | [K1, K2, K3, K4, K5]
      | [K1, K2, K3, K4, K5, K6]
  ):
    | T
    | T[K1]
    | T[K1][K2]
    | T[K1][K2][K3]
    | T[K1][K2][K3][K4]
    | T[K1][K2][K3][K4][K5]
    | T[K1][K2][K3][K4][K5][K6] {
    const hasStateAnyKeys = Object.keys(this.accumulator.state).length > 0;
    if (!!keys && keys.length) {
      return safePluck(this.accumulator.state, keys);
    } else {
      return hasStateAnyKeys
        ? this.accumulator.state
        : (undefined as unknown as T);
    }
  }

  /**
   * @description
   * Manipulate one or many properties of the state by providing a `Partial<T>` state or a `ProjectionFunction<T>`.
   *
   * @example
   * // Update one or many properties of the state by providing a `Partial<T>`
   *
   * const partialState = {
   *   foo: 'bar',
   *   bar: 5
   * };
   * state.set(partialState);
   *
   * // Update one or many properties of the state by providing a `ProjectionFunction<T>`
   *
   * const reduceFn = oldState => ({
   *   bar: oldState.bar + 5
   * });
   * state.set(reduceFn);
   *
   * @param {Partial<T>|ProjectStateFn<T>} stateOrProjectState
   * @return void
   */
  set(stateOrProjectState: Partial<T> | ProjectStateFn<T>): void;

  /**
   * @description
   * Manipulate a single property of the state by the property name and a `ProjectionFunction<T>`.
   *
   * @example
   * const reduceFn = oldState => oldState.bar + 5;
   * state.set('bar', reduceFn);
   *
   * @param {K} key
   * @param {ProjectValueFn<T, K>} projectSlice
   * @return void
   */
  set<K extends keyof T, O>(key: K, projectSlice: ProjectValueFn<T, K>): void;
  /**
   * @internal
   */
  set<K extends keyof T>(
    keyOrStateOrProjectState: Partial<T> | ProjectStateFn<T> | K,
    stateOrSliceProjectFn?: ProjectValueFn<T, K>
  ): void {
    if (
      typeof keyOrStateOrProjectState === 'object' &&
      stateOrSliceProjectFn === undefined
    ) {
      this.accumulator.nextSlice(keyOrStateOrProjectState);
      return;
    }

    if (
      typeof keyOrStateOrProjectState === 'function' &&
      stateOrSliceProjectFn === undefined
    ) {
      this.accumulator.nextSlice(
        keyOrStateOrProjectState(this.accumulator.state)
      );
      return;
    }

    if (
      isKeyOf<T>(keyOrStateOrProjectState) &&
      typeof stateOrSliceProjectFn === 'function'
    ) {
      const state: Partial<T> = {};
      state[keyOrStateOrProjectState] = stateOrSliceProjectFn(
        this.accumulator.state
      );
      this.accumulator.nextSlice(state);
      return;
    }

    throw new Error('wrong params passed to set');
  }

  /**
   * @description
   * Connect an `Observable<Partial<T>>` to the state `T`.
   * Any change emitted by the source will get merged into the state.
   * Subscription handling is done automatically.
   *
   * @example
   * const sliceToAdd$ = interval(250).pipe(mapTo({
   *   bar: 5,
   *   foo: 'foo'
   * });
   * state.connect(sliceToAdd$);
   * // every 250ms the properties bar and foo get updated due to the emission of sliceToAdd$
   *
   * // Additionally you can provide a `projectionFunction` to access the current state object and do custom mappings.
   *
   * const sliceToAdd$ = interval(250).pipe(mapTo({
   *   bar: 5,
   *   foo: 'foo'
   * });
   * state.connect(sliceToAdd$, (state, slice) => state.bar += slice.bar);
   * // every 250ms the properties bar and foo get updated due to the emission of sliceToAdd$. Bar will increase by
   * // 5 due to the projectionFunction
   */
  connect(inputOrSlice$: Observable<Partial<T>>): void;
  /**
   * @description
   * Connect a `Signal<Partial<T>>` to the state `T`.
   * Any change emitted by the source will get merged into the state.
   */
  connect(signal: Signal<Partial<T>>): void;

  /**
   * @description
   * Connect an `Observable<V>` to the state `T`.
   * Any change emitted by the source will get forwarded to to project function and merged into the state.
   * Subscription handling is done automatically.
   *
   * You have to provide a `projectionFunction` to access the current state object and do custom mappings.
   *
   * @example
   * const sliceToAdd$ = interval(250);
   * state.connect(sliceToAdd$, (s, v) => ({bar: v}));
   * // every 250ms the property bar get updated due to the emission of sliceToAdd$
   *
   */
  connect<V>(
    inputOrSlice$: Observable<V>,
    projectFn: ProjectStateReducer<T, V>
  ): void;
  /**
   * @description
   * Connect a `Signal<V>` to the state `T`.
   * Any change emitted by the source will get forwarded to the project function and merged into the state.
   *
   * You have to provide a `projectionFunction` to access the current state object and do custom mappings.
   */
  connect<V>(signal: Signal<V>, projectFn: ProjectStateReducer<T, V>): void;
  /**
   *
   * @description
   * Connect an `Observable<T[K]>` source to a specific property `K` in the state `T`. Any emitted change will update
   * this
   * specific property in the state.
   * Subscription handling is done automatically.
   *
   * @example
   * const myTimer$ = interval(250);
   * state.connect('timer', myTimer$);
   * // every 250ms the property timer will get updated
   */
  connect<K extends keyof T>(key: K, slice$: Observable<T[K]>): void;
  /**
   *
   * @description
   * Connect a `Signal<T[K]>` source to a specific property `K` in the state `T`. Any emitted change will update
   * this specific property in the state.
   */
  connect<K extends keyof T>(key: K, signal: Signal<T[K]>): void;
  /**
   *
   * @description
   * Connect an `Observable<V>` source to a specific property in the state. Additionally you can provide a
   * `projectionFunction` to access the current state object on every emission of your connected `Observable`.
   * Any change emitted by the source will get merged into the state.
   * Subscription handling is done automatically.
   *
   * @example
   * const myTimer$ = interval(250);
   * state.connect('timer', myTimer$, (state, timerChange) => state.timer += timerChange);
   * // every 250ms the property timer will get updated
   */
  connect<K extends keyof T, V>(
    key: K,
    input$: Observable<V>,
    projectSliceFn: ProjectValueReducer<T, K, V>
  ): void;
  /**
   *
   * @description
   * Connect a `Signal<V>` source to a specific property in the state. Additionally, you can provide a
   * `projectionFunction` to access the current state object on every emission of your connected `Observable`.
   * Any change emitted by the source will get merged into the state.
   * Subscription handling is done automatically.
   */
  connect<K extends keyof T, V>(
    key: K,
    signal: Signal<V>,
    projectSliceFn: ProjectValueReducer<T, K, V>
  ): void;
  /**
   * @internal
   */
  connect<K extends keyof T, V extends Partial<T>>(
    keyOrInputOrSlice$: K | Observable<Partial<T> | V> | Signal<Partial<T> | V>,
    projectOrSlices$?:
      | ProjectStateReducer<T, V>
      | Observable<T[K] | V>
      | Signal<T[K] | V>,
    projectValueFn?: ProjectValueReducer<T, K, V>
  ): void {
    let inputOrSlice$: Observable<Partial<T> | V>;
    if (!isKeyOf<T>(keyOrInputOrSlice$)) {
      if (isObservable(keyOrInputOrSlice$)) {
        inputOrSlice$ = keyOrInputOrSlice$;
      } else {
        // why can't typescript infer the correct type?
        inputOrSlice$ = toObservable(
          keyOrInputOrSlice$ as Signal<Partial<T> | V>,
          { injector: this.injector }
        );
      }
    }
    const key: K | null =
      !inputOrSlice$ && isKeyOf<T>(keyOrInputOrSlice$)
        ? keyOrInputOrSlice$
        : null;
    if (
      projectValueFn === undefined &&
      projectOrSlices$ === undefined &&
      inputOrSlice$
    ) {
      this.accumulator.nextSliceObservable(inputOrSlice$);
      return;
    }

    let slices$: Observable<T[K] | V> | null = null;
    let stateReducer: ProjectStateReducer<T, V>;

    if (projectOrSlices$) {
      if (isObservable(projectOrSlices$)) {
        slices$ = projectOrSlices$;
      } else if (isSignal(projectOrSlices$)) {
        slices$ = toObservable(projectOrSlices$, { injector: this.injector });
      } else {
        stateReducer = projectOrSlices$;
      }
    }

    if (inputOrSlice$ && projectValueFn === undefined && stateReducer) {
      const slice$ = inputOrSlice$.pipe(
        map((v) => stateReducer(this.get(), v as V))
      );
      this.accumulator.nextSliceObservable(slice$);
      return;
    }

    if (projectValueFn === undefined && key && slices$) {
      const slice$ = slices$.pipe(map((value) => ({ ...{}, [key]: value })));
      this.accumulator.nextSliceObservable(slice$);
      return;
    }

    if (typeof projectValueFn === 'function' && key && slices$) {
      const slice$ = slices$.pipe(
        map((value) => ({
          ...{},
          [key]: projectValueFn(this.get(), value as V),
        }))
      );
      this.accumulator.nextSliceObservable(slice$);
      return;
    }

    throw new Error('wrong params passed to connect');
  }

  /**
   * @description
   * Returns the state as cached and distinct `Observable<T>`. This way you don't have to think about **late
   * subscribers**,
   * **multiple subscribers** or **multiple emissions** of the same value
   *
   * @example
   * const state$ = state.select();
   * state$.subscribe(state => doStuff(state));
   *
   * @returns Observable<T>
   */
  select(): Observable<T>;

  /**
   * @description
   * Returns the state as cached and distinct `Observable<A>`. Accepts arbitrary
   * [rxjs operators](https://rxjs-dev.firebaseapp.com/guide/operators) to enrich the selection with reactive
   *   composition.
   *
   * @example
   * const profilePicture$ = state.select(
   *  pluck('profilePicture'),
   *  switchMap(profilePicture => mapImageAsync(profilePicture))
   * );
   * @param op { OperatorFunction<T, A> }
   * @returns Observable<A>
   */
  select<A = T>(op: OperatorFunction<T, A>): Observable<A>;
  /**
   * @internal
   */
  select<A = T, B = A>(
    op1: OperatorFunction<T, A>,
    op2: OperatorFunction<A, B>
  ): Observable<B>;
  /**
   * @internal
   */
  select<A = T, B = A, C = B>(
    op1: OperatorFunction<T, A>,
    op2: OperatorFunction<A, B>,
    op3: OperatorFunction<B, C>
  ): Observable<C>;
  /**
   * @internal
   */
  select<A = T, B = A, C = B, D = C>(
    op1: OperatorFunction<T, A>,
    op2: OperatorFunction<A, B>,
    op3: OperatorFunction<B, C>,
    op4: OperatorFunction<C, D>
  ): Observable<D>;
  /**
   * @internal
   */
  select<A = T, B = A, C = B, D = C, E = D>(
    op1: OperatorFunction<T, A>,
    op2: OperatorFunction<A, B>,
    op3: OperatorFunction<B, C>,
    op4: OperatorFunction<C, D>,
    op5: OperatorFunction<D, E>
  ): Observable<E>;
  /**
   * @description
   * Transform a slice of the state by providing keys and map function.
   * Returns result of applying function to state slice as cached and distinct `Observable<V>`.
   *
   * @example
   * // Project state slice
   * const text$ = state.select(
   *   ['query', 'results'],
   *   ({ query, results }) => `${results.length} results found for "${query}"`
   * );
   *
   * @return Observable<V>
   */
  select<K extends keyof T, V>(
    keys: K[],
    fn: (slice: PickSlice<T, K>) => V,
    keyCompareMap?: KeyCompareMap<Pick<T, K>>
  ): Observable<V>;
  /**
   * @description
   * Transform a single property of the state by providing a key and map function.
   * Returns result of applying function to state property as cached and distinct `Observable<V>`.
   *
   * @example
   * // Project state based on single property
   * const foo$ = state.select('bar', bar => `bar equals ${bar}`);
   *
   * @return Observable<V>
   */
  select<K extends keyof T, V>(k: K, fn: (val: T[K]) => V): Observable<V>;
  /**
   * @description
   * Access a single property of the state by providing keys.
   * Returns a single property of the state as cached and distinct `Observable<T[K1]>`.
   *
   * @example
   * // Access a single property
   *
   * const bar$ = state.select('bar');
   *
   * // Access a nested property
   *
   * const foo$ = state.select('bar', 'foo');
   *
   * @return Observable<T[K1]>
   */
  select<K1 extends keyof T>(k1: K1): Observable<T[K1]>;
  /**
   * @internal
   */
  select<K1 extends keyof T, K2 extends keyof T[K1]>(
    k1: K1,
    k2: K2
  ): Observable<T[K1][K2]>;
  /**
   * @internal
   */
  select<
    K1 extends keyof T,
    K2 extends keyof T[K1],
    K3 extends keyof T[K1][K2]
  >(k1: K1, k2: K2, k3: K3): Observable<T[K1][K2][K3]>;
  /**
   * @internal
   */
  select<
    K1 extends keyof T,
    K2 extends keyof T[K1],
    K3 extends keyof T[K1][K2],
    K4 extends keyof T[K1][K2][K3]
  >(k1: K1, k2: K2, k3: K3, k4: K4): Observable<T[K1][K2][K3][K4]>;
  /**
   * @internal
   */
  select<
    K1 extends keyof T,
    K2 extends keyof T[K1],
    K3 extends keyof T[K1][K2],
    K4 extends keyof T[K1][K2][K3],
    K5 extends keyof T[K1][K2][K3][K4]
  >(k1: K1, k2: K2, k3: K3, k4: K4, k5: K5): Observable<T[K1][K2][K3][K4][K5]>;
  /**
   * @internal
   */
  select<
    K1 extends keyof T,
    K2 extends keyof T[K1],
    K3 extends keyof T[K1][K2],
    K4 extends keyof T[K1][K2][K3],
    K5 extends keyof T[K1][K2][K3][K4],
    K6 extends keyof T[K1][K2][K3][K4][K5]
  >(
    k1: K1,
    k2: K2,
    k3: K3,
    k4: K4,
    k5: K5,
    k6: K6
  ): Observable<T[K1][K2][K3][K4][K5][K6]>;
  /**
   * @internal
   */
  select<R>(
    ...args:
      | OperatorFunction<T, unknown>[]
      | string[]
      | [k: string, fn: (val: unknown) => unknown]
      | [
          keys: string[],
          fn: (slice: unknown) => unknown,
          keyCompareMap?: KeyCompareMap<T>
        ]
  ): Observable<T | R> {
    return this.accumulator.state$.pipe(
      select(...(args as Parameters<typeof select>))
    );
  }

  /**
   * @description
   * Returns a signal of the given key. It's first value is determined by the
   * current keys value in RxState. Whenever the key gets updated, the signal
   * will also be updated accordingly.
   */
  signal<K extends keyof T>(k: K): Signal<T[K]> {
    return this.signalStoreProxy[k];
  }

  /**
   * @description
   * Lets you create a computed signal based off of multiple keys stored in RxState.
   */
  computed<C>(fn: (slice: SignalStateProxy<T>) => C): Signal<C> {
    return computed(() => {
      return fn(this.signalStoreProxy);
    });
  }

  /**
   * @description
   * Lets you create a computed signal derived from state and rxjs operators.
   *
   * @throws If the initial value is not provided and the signal is not sync. Use startWith() to provide an initial value.
   */
  computedFrom<Output>(
    ...operators: OperatorFunction<T, Output>[]
  ): Signal<Output> {
    return toSignal(
      // @ts-ignore
      this.select(...operators),
      { injector: this.injector, requireSync: true }
    );
  }

  /**
   * @description
   * Manages side-effects of your state. Provide an `Observable<any>` **side-effect** and an optional
   * `sideEffectFunction`.
   * Subscription handling is done automatically.
   *
   * @example
   * // Directly pass an observable side-effect
   * const localStorageEffect$ = changes$.pipe(
   *  tap(changes => storeChanges(changes))
   * );
   * state.hold(localStorageEffect$);
   *
   * // Pass an additional `sideEffectFunction`
   *
   * const localStorageEffectFn = changes => storeChanges(changes);
   * state.hold(changes$, localStorageEffectFn);
   *
   * @param {Observable<S>} obsOrObsWithSideEffect
   * @param {function} [sideEffectFn]
   */
  hold<S>(
    obsOrObsWithSideEffect: Observable<S>,
    sideEffectFn?: (arg: S) => void
  ): void {
    const sideEffect = obsOrObsWithSideEffect.pipe(catchError((e) => EMPTY));
    if (typeof sideEffectFn === 'function') {
      this.effectObservable.nextEffectObservable(
        sideEffect.pipe(tap(sideEffectFn))
      );
      return;
    }
    this.effectObservable.nextEffectObservable(sideEffect);
  }

  /**
   * @internal
   */
  subscribe(): Unsubscribable {
    const subscription = new Subscription();
    subscription.add(this.accumulator.subscribe());
    subscription.add(this.effectObservable.subscribe());
    this.signalStoreProxy = createSignalStateProxy<T>(
      this.$,
      this.get.bind(this)
    );
    return subscription;
  }
}
