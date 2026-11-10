import { byCodePoint, prefixOf, XML_NAMESPACE } from '@exemplarjs/xml/internal';
import type { CanonicalizeOptions } from './canonicalize.ts';
import { type AncestorAttribute, withInheritedXmlAttributes } from './inheritance.ts';

/** The forms Canonical XML has: 1.0, 1.1, and Exclusive Canonicalization. */
export type CanonicalXMLMethod = 'c14n' | 'c14n11' | 'exc-c14n';

/** An attribute to write: namespace URI, local name, qualified name and value. */
export type CanonicalAttribute = [string, string, string, string];

/** The references Canonical XML writes in text and in attribute values (C14N 1.0 §2.3). */
const TEXT_REFERENCES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '\r': '&#xD;' };
const ATTRIBUTE_REFERENCES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '"': '&quot;',
  '\t': '&#x9;',
  '\n': '&#xA;',
  '\r': '&#xD;',
};

/** The characters Canonical XML replaces in text and in attribute values: one pattern to find one, one to replace them all. */
const TEXT_CHAR_TO_ESCAPE = /[&<>\r]/;
const TEXT_CHARS_TO_ESCAPE = /[&<>\r]/g;
const ATTRIBUTE_CHAR_TO_ESCAPE = /[&<"\t\n\r]/;
const ATTRIBUTE_CHARS_TO_ESCAPE = /[&<"\t\n\r]/g;

/** Text with the characters a table names replaced; text holding none is returned as it is, which is the common case. */
function escape(text: string, findOne: RegExp, findAll: RegExp, references: Readonly<Record<string, string>>): string {
  return findOne.test(text) ? text.replaceAll(findAll, (char) => references[char] as string) : text;
}

/** Sorts attributes by namespace URI, then local name. */
export function sortAttributes(attributes: readonly CanonicalAttribute[]): CanonicalAttribute[] {
  return attributes.toSorted((a, b) => byCodePoint(a[0], b[0]) || byCodePoint(a[1], b[1]));
}

/**
 * What Canonical XML 1.0 and 1.1 and Exclusive Canonicalization share, whether they read a source or a
 * DOM tree: how characters, comments, processing instructions and start tags are written.
 *
 * A canonical form writes a document one fixed way, so that two documents that mean the same thing
 * come out as the same text, which can then be compared or signed. For example, `<a b='1'  a="2"/>`
 * becomes `<a a="2" b="1"></a>`: attributes sorted, double quotes, no empty-element tags. The
 * subclasses walk the document; this class writes each piece and adds it to `output`.
 */
export abstract class Canonicalizer {
  protected readonly method: CanonicalXMLMethod;
  /** Whether this is Exclusive Canonicalization, which declares only the namespaces an element uses. */
  protected readonly isExclusive: boolean;
  /** Whether comments are kept; the forms leave them out by default. */
  protected readonly keepsComments: boolean;
  /** The prefixes Exclusive Canonicalization treats inclusively, `''` for the default namespace. */
  readonly #inclusivePrefixes: ReadonlySet<string>;
  /** Whether text is put in Normalization Form C, as it is when decoded from an encoding that isn't a Unicode one. */
  readonly #normalizesToNFC: boolean;
  /** The canonical form written so far. */
  protected output = '';

  protected constructor(method: CanonicalXMLMethod, options: CanonicalizeOptions, encoding: string | null | undefined) {
    this.method = method;
    this.isExclusive = method === 'exc-c14n';
    this.keepsComments = options.comments ?? false;
    this.#inclusivePrefixes = new Set(
      (options.inclusivePrefixes ?? []).map((prefix) => (prefix === '#default' ? '' : prefix))
    );
    this.#normalizesToNFC = !/^(utf|ucs|iso-10646)/.test(encoding?.toLowerCase() ?? 'utf-8');
  }

  /** Text in Normalization Form C when it was decoded from an encoding that is not a Unicode one. */
  protected normalized(text: string): string {
    return this.#normalizesToNFC ? text.normalize('NFC') : text;
  }

  /** Writes character data, escaped. */
  protected writeCharacters(text: string): void {
    this.output += escape(this.normalized(text), TEXT_CHAR_TO_ESCAPE, TEXT_CHARS_TO_ESCAPE, TEXT_REFERENCES);
  }

  /** An attribute value, escaped for writing between double quotes. */
  #escapedValue(value: string): string {
    return escape(this.normalized(value), ATTRIBUTE_CHAR_TO_ESCAPE, ATTRIBUTE_CHARS_TO_ESCAPE, ATTRIBUTE_REFERENCES);
  }

  /** A comment's canonical form. */
  protected commentMarkup(data: string): string {
    return `<!--${this.normalized(data)}-->`;
  }

  /** A processing instruction's canonical form: one space after the target, none when there is no data. */
  protected piMarkup(target: string, data: string): string {
    const text = this.normalized(data);
    return text === '' ? `<?${target}?>` : `<?${target} ${text}?>`;
  }

  /** For Exclusive Canonicalization, the prefixes an element and its attributes use, and the inclusive ones in scope. */
  protected usedPrefixes(
    prefix: string,
    attributes: readonly CanonicalAttribute[],
    scope: ReadonlyMap<string, string>
  ): Set<string> {
    const candidates = new Set<string>([prefix]);
    for (const [uri, , name] of attributes) if (uri !== '' && uri !== XML_NAMESPACE) candidates.add(prefixOf(name));
    for (const inclusive of this.#inclusivePrefixes) if (scope.has(inclusive)) candidates.add(inclusive);
    return candidates;
  }

  /**
   * The prefixes a start tag may declare: for Exclusive Canonicalization, those it uses; else every
   * prefix in scope at the apex, which has no ancestor in the subset, and those it declares elsewhere.
   */
  protected candidatePrefixes(
    isApex: boolean,
    scope: ReadonlyMap<string, string>,
    prefix: string,
    attributes: readonly CanonicalAttribute[],
    declaredHere: () => Iterable<string>
  ): Iterable<string> {
    if (this.isExclusive) return this.usedPrefixes(prefix, attributes, scope);
    return isApex ? scope.keys() : declaredHere();
  }

  /** A start tag's attributes sorted; the apex's with its ancestors' `xml:` attributes, which the inclusive forms have it take on. */
  protected sortedAttributes(
    attributes: readonly CanonicalAttribute[],
    ancestors: readonly AncestorAttribute[] | undefined
  ): CanonicalAttribute[] {
    const method = this.method;
    if (ancestors === undefined || method === 'exc-c14n') return sortAttributes(attributes);
    return sortAttributes(withInheritedXmlAttributes(method, attributes, ancestors));
  }

  /**
   * Writes a start tag: a declaration for each candidate prefix whose namespace differs from the one
   * already rendered by an ancestor, then the attributes. Returns the namespaces rendered from here in.
   */
  protected writeStartTag(
    name: string,
    candidates: Iterable<string>,
    scope: ReadonlyMap<string, string>,
    parentRendered: ReadonlyMap<string, string>,
    attributes: readonly CanonicalAttribute[]
  ): ReadonlyMap<string, string> {
    const declarations: [string, string][] = [];
    for (const prefix of candidates) {
      const uri = scope.get(prefix) ?? '';
      if (prefix !== 'xml' && (parentRendered.get(prefix) ?? '') !== uri) declarations.push([prefix, uri]);
    }
    let rendered = parentRendered;
    if (declarations.length > 0) rendered = new Map([...parentRendered, ...declarations]);
    let tag = `<${name}`;
    for (const [prefix, uri] of declarations.toSorted((a, b) => byCodePoint(a[0], b[0]))) {
      tag += prefix === '' ? ` xmlns="${this.#escapedValue(uri)}"` : ` xmlns:${prefix}="${this.#escapedValue(uri)}"`;
    }
    for (const attribute of attributes) tag += ` ${attribute[2]}="${this.#escapedValue(attribute[3])}"`;
    this.output += `${tag}>`;
    return rendered;
  }
}
