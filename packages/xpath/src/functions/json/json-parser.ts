import { dynamicError, XPathErrorCode } from '@/api/xpath-exception';
import { ESCAPE_BODY } from './json-strings.ts';

/** One `"key": value` member of a JSON object, its key decoded. */
export interface JsonEntry {
  readonly key: string;
  readonly value: JsonValue;
}

/** A JSON value as the parser reads it: numbers keep the text they were written with, strings are decoded. */
export type JsonValue =
  | { readonly kind: 'object'; readonly entries: readonly JsonEntry[] }
  | { readonly kind: 'array'; readonly members: readonly JsonValue[] }
  | { readonly kind: 'string'; readonly text: string }
  | { readonly kind: 'number'; readonly text: string }
  | { readonly kind: 'boolean'; readonly value: boolean }
  | { readonly kind: 'null' };

/** Turns the text between a string's quotes, escapes and all, into the string the caller wants. */
export type StringDecoder = (raw: string) => string;

/** A JSON number (RFC 7159 §6), from the current position. */
const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
/** A JSON string's content up to its closing quote: characters other than quotes, backslashes and controls, and escapes. */
const STRING_CONTENT = new RegExp(String.raw`(?:[^"\\\u0000-\u001F]|\\${ESCAPE_BODY})+`, 'y');
/** The deepest nesting of objects and arrays read; deeper JSON raises FOJS0001 rather than exhausting the stack. */
const MAX_DEPTH = 1000;

/** Whitespace between tokens: space, tab, line feed and carriage return. */
const WHITESPACE = /[ \t\n\r]+/y;

/**
 * Reads JSON text (RFC 7159) into a JsonValue: any value at the top, with whitespace around
 * tokens; FOJS0001 for anything else. Strings go through the decoder, so that the caller's
 * escape and fallback options decide what they hold.
 *
 * @example
 * parseJson('{"a": [1, "two"]}', (raw) => raw); // { kind: 'object', entries: [{ key: 'a', value: ... }] }
 */
export function parseJson(text: string, decode: StringDecoder): JsonValue {
  const parser = new JsonParser(text, decode);
  const value = parser.value();
  parser.end();
  return value;
}

/** The state of one parse: the text, where it has got to, and the string decoder. */
class JsonParser {
  readonly #text: string;
  readonly #decode: StringDecoder;
  #position = 0;
  /** How many objects and arrays are open. */
  #depth = 0;

  constructor(text: string, decode: StringDecoder) {
    this.#text = text;
    this.#decode = decode;
  }

  /** Raises FOJS0001 for text that is not JSON, saying where. */
  #fail(what: string): never {
    return dynamicError(XPathErrorCode.INVALID_JSON, `${what} at offset ${this.#position} of the JSON text`);
  }

  /** Skips whitespace and returns the next character, or `''` at the end. */
  #peek(): string {
    WHITESPACE.lastIndex = this.#position;
    if (WHITESPACE.test(this.#text)) this.#position = WHITESPACE.lastIndex;
    return this.#text.charAt(this.#position);
  }

  /** Takes a character, which must come next. */
  #expect(character: string): void {
    if (this.#peek() !== character) this.#fail(`Expected "${character}"`);
    this.#position++;
  }

  /** Takes a keyword, which must come next. */
  #keyword(word: string): void {
    if (!this.#text.startsWith(word, this.#position)) this.#fail(`Expected "${word}"`);
    this.#position += word.length;
  }

  /** Reads one value. */
  value(): JsonValue {
    const next = this.#peek();
    switch (next) {
      case '{': {
        return this.#object();
      }
      case '[': {
        return this.#array();
      }
      case '"': {
        return { kind: 'string', text: this.#string() };
      }
      case 't':
      case 'f': {
        const value = next === 't';
        this.#keyword(value ? 'true' : 'false');
        return { kind: 'boolean', value };
      }
      case 'n': {
        this.#keyword('null');
        return { kind: 'null' };
      }
      default: {
        return { kind: 'number', text: this.#number() };
      }
    }
  }

  /** Checks that nothing but whitespace follows the value. */
  end(): void {
    if (this.#peek() !== '') this.#fail('Unexpected text after the JSON value');
  }

  /** Reads an object's members, `{` to `}`. */
  #object(): JsonValue {
    return { kind: 'object', entries: this.#list('}', () => this.#entry()) };
  }

  /** Reads one `"key": value` member of an object. */
  #entry(): JsonEntry {
    if (this.#peek() !== '"') this.#fail('Expected a string key');
    const key = this.#string();
    this.#expect(':');
    return { key, value: this.value() };
  }

  /** Reads an array's members, `[` to `]`. */
  #array(): JsonValue {
    return { kind: 'array', members: this.#list(']', () => this.value()) };
  }

  /** Reads the items of an object or array from its opening bracket to its closing one, separated by commas. */
  #list<Item>(close: string, readItem: () => Item): Item[] {
    if (++this.#depth > MAX_DEPTH) this.#fail(`Objects and arrays nested more than ${MAX_DEPTH} deep`);
    this.#position++;
    const items: Item[] = [];
    if (this.#peek() !== close) {
      do items.push(readItem());
      while (this.#takeComma());
    }
    this.#expect(close);
    this.#depth--;
    return items;
  }

  /** Takes a comma when one comes next. */
  #takeComma(): boolean {
    if (this.#peek() !== ',') return false;
    this.#position++;
    return true;
  }

  /** Reads a string, quote to quote, and decodes it. */
  #string(): string {
    const start = this.#position + 1;
    STRING_CONTENT.lastIndex = start;
    // No content, as in `""`, leaves the string ending where it starts.
    const end = STRING_CONTENT.test(this.#text) ? STRING_CONTENT.lastIndex : start;
    this.#position = end;
    if (this.#text.charAt(end) !== '"') this.#fail('Expected a valid string character or escape');
    this.#position = end + 1;
    return this.#decode(this.#text.slice(start, end));
  }

  /** Reads a number's text. */
  #number(): string {
    NUMBER.lastIndex = this.#position;
    const match = NUMBER.exec(this.#text);
    if (match === null) return this.#fail('Expected a JSON value');
    this.#position = NUMBER.lastIndex;
    return match[0];
  }
}
