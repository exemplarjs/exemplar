// Errors exemplar raises on purpose carry no stack trace: it would list only exemplar's own frames,
// and capturing one costs microseconds per error, which thousands of recoverable errors add up.

/** A class of error exemplar raises: its own, or a built-in such as `TypeError` or `DOMException`. */
type ErrorClass = new (...args: never[]) => Error;

/** Builds and checks every error exemplar raises or catches on purpose. */
export const ErrorFactory = {
  /** Builds an error of the given class, with the arguments its constructor takes, without a stack trace. */
  create<T extends ErrorClass>(type: T, ...args: ConstructorParameters<T>): InstanceType<T> {
    const limit = Error.stackTraceLimit;
    // Engines without the limit, and a frozen `Error`, keep capturing as they do.
    const pauses = limit !== undefined && Object.isExtensible(Error);
    if (pauses) Error.stackTraceLimit = 0;
    try {
      return new type(...(args as never[])) as InstanceType<T>;
    } finally {
      if (pauses) Error.stackTraceLimit = limit;
    }
  },

  /** Returns a caught error when it is of one of the expected classes; throws anything else on unchanged. */
  expect<T extends readonly ErrorClass[]>(error: unknown, ...types: T): InstanceType<T[number]> {
    if (types.some((type) => error instanceof type)) return error as InstanceType<T[number]>;
    throw error;
  },
};

/** Raised by a synchronous reader for what only an asynchronous one can read: a stream, or a resolver's promise. */
export class AsyncReaderRequiredError extends TypeError {
  override name = 'AsyncReaderRequiredError';
}

/** Raised for a value in options or arguments that the API does not take, such as an encoding the writer has no encoder for. */
export class InvalidArgumentError extends Error {
  override name = 'InvalidArgumentError';
}

/** Raised for a call made at the wrong moment, such as `elementText()` away from a start tag. */
export class IllegalStateError extends Error {
  override name = 'IllegalStateError';
}
