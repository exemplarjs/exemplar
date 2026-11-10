/** Handles a rejection by doing nothing. */
function ignore(): void {
  // Nothing to do: the caller has already raised the error that matters.
}

/** Marks a promise no one will wait for, so that its rejection is not reported as unhandled. */
export function abandon(promise: Promise<unknown>): void {
  promise.catch(ignore);
}
