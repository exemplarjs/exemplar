/** One kind of state a compiler keeps for the expressions it compiles, and how it is first made. */
export interface CompilerStateKey<State> {
  readonly make: () => State;
}

/**
 * What one compiler keeps for every expression it compiles: each kind of state is made when first
 * asked for, and all of it goes when the compiler does. The module that needs a kind declares its key.
 *
 * ```ts
 * const COLLATIONS: CompilerStateKey<Collations> = { make: () => new Collations() };
 * staticContext.compilerState.get(COLLATIONS).resolve(uri, staticContext.baseURI);
 * ```
 */
export class CompilerState {
  readonly #states = new Map<CompilerStateKey<unknown>, unknown>();

  /** The compiler's state of one kind, made the first time it is asked for. */
  get<State>(key: CompilerStateKey<State>): State {
    let state = this.#states.get(key);
    if (state === undefined) {
      state = key.make();
      this.#states.set(key, state);
    }
    return state as State;
  }
}
