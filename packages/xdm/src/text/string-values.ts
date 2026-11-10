import { collapseWhitespace, WHITESPACE_CLASS } from '@exemplarjs/xml/internal';
import { type AtomicType, type Whitespace, XS } from '@/types/built-in-types';

/** The whitespace characters of XML Schema's whitespace handling: space, tab, line feed and carriage return. */
const WHITESPACE = new RegExp(WHITESPACE_CLASS, 'g');

/** Text after a type's whitespace handling: kept, each whitespace character made a space, or runs collapsed and trimmed. */
export function applyWhitespace(text: string, whitespace: Whitespace): string {
  if (whitespace === 'preserve') return text;
  if (whitespace === 'replace') return text.replaceAll(WHITESPACE, ' ');
  return collapseWhitespace(text);
}

/** The whitespace handling a type applies: the nearest one it or a base type sets, else none for text and collapsing for the rest. */
export function whitespaceOf(type: AtomicType): Whitespace {
  for (let current: AtomicType | null = type; current !== null; current = current.base) {
    const whitespace = current.restriction.whitespace;
    if (whitespace !== undefined) return whitespace;
  }
  return isTextType(type) ? 'preserve' : 'collapse';
}

/** Whether text, already whitespace-handled, meets the checks of a type and every type it derives from. */
export function acceptsText(type: AtomicType, text: string): boolean {
  for (let current: AtomicType | null = type; current !== null; current = current.base) {
    const accepts = current.restriction.accepts;
    if (accepts !== undefined && !accepts(text)) return false;
  }
  return true;
}

/** Whether a type's values are plain text: the string types and `xs:untypedAtomic`. */
export function isTextType(type: AtomicType): boolean {
  const primitive = type.primitive;
  return primitive === XS.string || primitive === XS.untypedAtomic;
}

/** Whether a type holds its value as a string: the string types, `xs:anyURI` and `xs:untypedAtomic`. */
export function isStringLike(type: AtomicType): boolean {
  const primitive = type.primitive;
  return primitive === XS.string || primitive === XS.anyURI || primitive === XS.untypedAtomic;
}
