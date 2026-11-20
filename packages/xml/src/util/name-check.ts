import { ErrorCode } from '@/errors/codes';
import { type Location, XMLError } from '@/errors/xml-error';
import { Char } from './chars.ts';
import { ErrorFactory } from './errors.ts';
import { NameCache } from './name-cache.ts';
import { isNcName, isXmlName } from './names.ts';

/** The names a check has passed: a `NameCache`, or a `Set` for a caller that hashes each name anyway. */
interface NameSet {
  has(name: string): boolean;
  add(name: string): unknown;
}

/** What a checked name names. */
type NamedKind = 'element' | 'attribute';

/** A prefix as an error message names it. */
function prefixText(prefix: string): string {
  return prefix === '' ? 'no prefix' : `prefix ${prefix}`;
}

/** Whether a qualified name is its prefix and local name joined by a colon, or its local name alone. */
function agrees(name: string, localName: string, prefix: string): boolean {
  if (prefix === '') return name === localName;
  return (
    name.length === prefix.length + 1 + localName.length &&
    name.startsWith(prefix) &&
    name.charCodeAt(prefix.length) === Char.COLON &&
    name.endsWith(localName)
  );
}

/**
 * Checks the names a document's events give its elements and attributes, where a filter, a delegate
 * or a SAX handler's caller may have made them and no parser has checked them. A failed check throws
 * an `XMLError` with the code a parser would give, at the location `where` gives. One check serves
 * one document, and caches the qualified names it finds well formed, as a document repeats its
 * names. It holds them as given, so it is dropped with the document and not kept for the next.
 *
 * ```ts
 * const check = new NameCheck(() => reader.location());
 * check.checkQName('element', 'p:a', 'a', 'p', 'urn:p');
 * check.checkQName('element', 'p:a', 'b', 'p', 'urn:p'); // throws NS_QNAME: the name and its parts disagree
 * ```
 */
export class NameCheck {
  readonly #where: () => Location;
  /** The names found well formed with no prefix, and those found so with one, whose parts agreed with them. */
  readonly #unprefixedNames: NameSet;
  readonly #prefixedNames: NameSet;

  /**
   * A check that fails at the location `where` gives. `makeNames` makes each of the two sets the
   * names found well formed are cached in, a `NameCache` by default; a caller that hashes each
   * name anyway, as a tree with a name table does, has it make a `Set`, which costs it nothing more.
   */
  constructor(where: () => Location, makeNames: () => NameSet = () => new NameCache()) {
    this.#where = where;
    this.#unprefixedNames = makeNames();
    this.#prefixedNames = makeNames();
  }

  /** Checks a name given with namespaces off: it must be a Name. */
  checkName(kind: NamedKind, name: string): void {
    if (!isXmlName(name)) this.#fail(ErrorCode.WF_NAME, `An ${kind} named ${name}, which is not a name`);
  }

  /** Checks a name given with namespaces on: a QName that agrees with its local name and prefix, whose prefix has a namespace. */
  checkQName(kind: NamedKind, name: string, localName: string, prefix: string, uri: string): void {
    // Apart, so that a name found well formed with a prefix does not vouch for the same text given as a local name.
    const wellFormedNames = prefix === '' ? this.#unprefixedNames : this.#prefixedNames;
    // A name already found well formed has well-formed parts, if they agree with it, which is checked next.
    if (!wellFormedNames.has(name)) {
      if (!isNcName(localName) || (prefix !== '' && !isNcName(prefix))) {
        this.#fail(ErrorCode.NS_QNAME, `An ${kind} with local name ${localName} and ${prefixText(prefix)}`);
      }
      if (agrees(name, localName, prefix)) wellFormedNames.add(name);
    }
    if (!agrees(name, localName, prefix)) {
      const parts = `local name ${localName} and ${prefixText(prefix)}`;
      this.#fail(ErrorCode.NS_QNAME, `An ${kind} named ${name} with ${parts}; a rename changes all three`);
    }
    if (prefix !== '' && uri === '') {
      this.#fail(ErrorCode.NS_UNBOUND_PREFIX, `An ${kind} named ${name}, whose prefix has no namespace`);
    }
  }

  /** Throws an XMLError at the location `where` gives. */
  #fail(code: ErrorCode, message: string): never {
    throw ErrorFactory.create(XMLError, code, message, this.#where());
  }
}
