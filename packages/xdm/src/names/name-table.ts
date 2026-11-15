import { QName } from '@exemplarjs/xml';
import { copyString, localPartOf, prefixOf } from '@exemplarjs/xml/internal';

// The three name-code sentinels below must differ.

/** Returned for a name the table does not hold. */
export const NO_NAME = -1;

/** A NodeTest name that matches every name. */
export const ANY_NAME = -2;

/** Returned by `singleCode` for an expanded name more than one code has. */
export const SEVERAL_CODES = -3;

/**
 * Gives each distinct name in the trees that share it a small integer, its name code, so that nodes
 * store a number rather than a string and name tests compare numbers.
 *
 * ```ts
 * const names = new NameTable();
 * const a = names.code('x:item', 'urn:x');
 * const b = names.code('y:item', 'urn:x');
 * names.expandedName(a) === names.expandedName(b); // true: same namespace and local name
 * ```
 *
 * A code stands for a prefix, namespace URI and local name, since XDM keeps the prefix a node was
 * written with. Codes that differ only in prefix share an expanded-name id, which is what
 * XPath name tests match.
 */
export class NameTable {
  /** The name each code stands for. */
  readonly #names: QName[] = [];
  /** The expanded-name id of each code. */
  readonly #expanded: number[] = [];
  /** Codes by qualified name: the first code seen for each, whichever namespace it was in. */
  readonly #byQName = new Map<string, number>();
  /** Codes by namespace and qualified name, for qualified names seen in more than one namespace. */
  readonly #byClarkQName = new Map<string, number>();
  /** Expanded-name ids by namespace and local name, in Clark notation: `{uri}local`. */
  readonly #expandedIds = new Map<string, number>();
  /** The code of each expanded-name id, or SEVERAL_CODES when codes with different prefixes share it. */
  readonly #codeOfExpanded: number[] = [];
  /** The table's copy of each namespace URI. */
  readonly #uris = new Map<string, string>([['', '']]);

  /** How many codes the table holds. */
  get size(): number {
    return this.#names.length;
  }

  /**
   * The table's own copy of a namespace URI, added when new. Names in the table hold these copies,
   * so passing one to `code` lets it compare URIs by identity.
   */
  namespace(uri: string): string {
    let copy = this.#uris.get(uri);
    if (copy === undefined) {
      copy = copyString(uri);
      this.#uris.set(copy, copy);
    }
    return copy;
  }

  /** The code of a qualified name in a namespace (`''` for none), added when new. */
  code(qualifiedName: string, namespaceURI: string): number {
    const code = this.#byQName.get(qualifiedName);
    if (code !== undefined && (this.#names[code] as QName).namespaceURI === namespaceURI) return code;
    return this.#otherCode(qualifiedName, namespaceURI, code === undefined);
  }

  /** The code of a qualified name not yet seen in this namespace; `unseenQName` when not seen in any. */
  #otherCode(qualifiedName: string, namespaceURI: string, unseenQName: boolean): number {
    const key = `{${namespaceURI}}${qualifiedName}`;
    const known = unseenQName ? undefined : this.#byClarkQName.get(key);
    if (known !== undefined) return known;
    // Copies, so that the table does not keep alive the input the names were sliced from.
    const name = copyString(qualifiedName);
    const uri = this.namespace(namespaceURI);
    const code = this.#add(name, uri);
    if (unseenQName) this.#byQName.set(name, code);
    else this.#byClarkQName.set(`{${uri}}${name}`, code);
    return code;
  }

  /** Adds a code for a qualified name in a namespace. */
  #add(qualifiedName: string, namespaceURI: string): number {
    const localName = localPartOf(qualifiedName);
    const prefix = prefixOf(qualifiedName);
    const code = this.#names.length;
    this.#names.push(new QName(namespaceURI, localName, prefix));
    const expanded = this.#expandedIdOf(namespaceURI, localName, true);
    this.#expanded.push(expanded);
    this.#codeOfExpanded[expanded] = this.#codeOfExpanded[expanded] === undefined ? code : SEVERAL_CODES;
    return code;
  }

  /** The expanded-name id of a namespace and local name, added when `add` and new, or NO_NAME. */
  #expandedIdOf(namespaceURI: string, localName: string, add: boolean): number {
    const key = `{${namespaceURI}}${localName}`;
    const id = this.#expandedIds.get(key);
    if (id !== undefined || !add) return id ?? NO_NAME;
    const next = this.#expandedIds.size;
    this.#expandedIds.set(key, next);
    return next;
  }

  /** The name a code stands for. */
  qName(code: number): QName {
    return this.#names[code] as QName;
  }

  /** The expanded-name id of a code: equal for codes with the same namespace and local name. */
  expandedName(code: number): number {
    return this.#expanded[code] as number;
  }

  /** The expanded-name id of a namespace and local name, or NO_NAME when the table does not hold it. */
  lookup(namespaceURI: string, localName: string): number {
    return this.#expandedIdOf(namespaceURI, localName, false);
  }

  /** The one code with an expanded-name id, or SEVERAL_CODES when names with different prefixes share it. */
  singleCode(expandedName: number): number {
    return this.#codeOfExpanded[expandedName] as number;
  }

  /** The expanded-name ids of every code, indexed by code, for loops that test many nodes. */
  get expandedNames(): readonly number[] {
    return this.#expanded;
  }
}
