import { Decimal, XdmAtomicValue, type XdmError } from '@/index';

/** An xs:decimal from its lexical form. */
export function decimal(text: string): XdmAtomicValue {
  return XdmAtomicValue.decimal(Decimal.parse(text) as Decimal);
}

/** The error code a function throws, or undefined when it does not throw. */
export function codeOf(run: () => unknown): string | undefined {
  try {
    run();
    return undefined;
  } catch (error) {
    return (error as XdmError).code;
  }
}
