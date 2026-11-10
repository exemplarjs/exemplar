import { XdmAtomicValue } from '@exemplarjs/xdm';
import { XPathException } from '@/index';
import { parseXPath } from '@/internal';
import { printXPath } from './print-syntax.ts';

/** An expression parsed and printed back with everything explicit, such as `child::a/attribute::b` for `a/@b`. */
export function explicit(text: string): string {
  return printXPath(parseXPath(text));
}

/** A syntax tree without its spans, and with each literal as its type and value, for comparing trees. */
export function shape(node: unknown): unknown {
  if (node instanceof XdmAtomicValue) return `${node.type.toString()} ${String(node.value)}`;
  if (Array.isArray(node)) return node.map((child) => shape(child));
  if (typeof node !== 'object' || node === null) return node;
  const entries = Object.entries(node).filter(([key]) => key !== 'start' && key !== 'end');
  return Object.fromEntries(entries.map(([key, value]) => [key, shape(value)]));
}

/** The XPathException parsing raises, or undefined when the expression parses. */
export function parseErrorOf(text: string): XPathException | undefined {
  try {
    parseXPath(text);
    return undefined;
  } catch (error) {
    if (error instanceof XPathException) return error;
    throw error;
  }
}

/** The error code parsing raises, or undefined when the expression parses. */
export function parseCodeOf(text: string): string | undefined {
  return parseErrorOf(text)?.code;
}
