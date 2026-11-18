import type { AttributeType } from '@/dtd/declarations';
import { ErrorCode } from '@/errors/codes';
import type { NamespaceBindings } from '@/namespaces/namespaces';
import type { Tokenizer } from '@/tokenizer/tokenizer';
import { isNcName } from '@/util/names';
import { reservedBindingProblem, UNDECLARING_PROBLEM, XMLNS_NAMESPACE } from '@/util/namespaces';
import { fail } from './internal.ts';
import type { NamespaceScopes } from './namespace-scopes.ts';

/**
 * A start tag's attributes as strings, with those the DTD defaults added after them. The reader
 * uses it for an element the DTD declares attributes for, or whose values refer to entities, and
 * reads straight from the buffer otherwise (see `AttributeCollector`).
 *
 * The attributes are kept in parallel arrays, one entry per attribute, so the list can be reused
 * for every start tag without allocating. Only the first `count` entries are current.
 */
export class AttributeList {
  /** Each attribute's qualified name, as written. */
  readonly names: string[] = [];
  /** Each attribute's value, normalized for its type. */
  readonly values: string[] = [];
  /** Each attribute's type, as the DTD declares it; CDATA when it doesn't. */
  readonly types: AttributeType[] = [];
  /** Whether each attribute was in the start tag rather than defaulted from the DTD. */
  readonly isSpecified: boolean[] = [];
  /** Whether normalizing for the declared type changed the value, which the standalone validity constraint asks about. */
  readonly changedByNormalizing: boolean[] = [];
  /** Each attribute's prefix, `''` for none; set by `resolveNamespaces`. */
  readonly prefixes: string[] = [];
  /** Each attribute's local name; set by `resolveNamespaces`. */
  readonly localNames: string[] = [];
  /** Each attribute's namespace URI, `''` for none; set by `resolveNamespaces`. */
  readonly uris: string[] = [];
  /** The indexes of the attributes the accessors report: all but `xmlns` declarations unless `namespacePrefixes` is on. */
  readonly visible: number[] = [];
  /** How many attributes the list holds now. */
  count = 0;
  /** How many of them the accessors report. */
  visibleCount = 0;

  /** Empties the list for the next start tag. */
  clear(): void {
    this.count = 0;
    this.visibleCount = 0;
  }

  /** Adds one attribute, with no namespace yet. */
  add(name: string, value: string, type: AttributeType, isSpecified: boolean, changedByNormalizing = false): void {
    const i = this.count++;
    this.names[i] = name;
    this.values[i] = value;
    this.changedByNormalizing[i] = changedByNormalizing;
    this.types[i] = type;
    this.isSpecified[i] = isSpecified;
    this.prefixes[i] = '';
    this.localNames[i] = name;
    this.uris[i] = '';
  }

  /** Whether the attribute at `attributeIndex` declares a namespace: `xmlns` or `xmlns:p`. */
  isDeclaration(attributeIndex: number): boolean {
    const name = this.names[attributeIndex] as string;
    return name === 'xmlns' || name.startsWith('xmlns:');
  }

  /** Lists every attribute as visible, for a reader that is not namespace-aware. */
  showAll(): void {
    for (let i = 0; i < this.count; i++) this.visible[i] = i;
    this.visibleCount = this.count;
  }

  /** Applies the namespace declarations among the attributes of the start tag `tokenizer` holds, recording each in `scopes`. */
  declareNamespaces(scopes: NamespaceScopes, tokenizer: Tokenizer): void {
    const bindings = scopes.bindings;
    for (let i = 0; i < this.count; i++) {
      if (!this.isDeclaration(i)) continue;
      const name = this.names[i] as string;
      const prefix = name === 'xmlns' ? '' : name.slice('xmlns:'.length);
      const at = nameIndexOf(tokenizer, i);
      if (name !== 'xmlns' && !isNcName(prefix))
        fail(tokenizer, ErrorCode.NS_QNAME, `${name} is not a qualified name`, at);
      checkDeclaration(tokenizer, prefix, this.values[i] as string, at);
      this.prefixes[i] = prefix === '' ? '' : 'xmlns';
      this.localNames[i] = prefix === '' ? 'xmlns' : prefix;
      this.uris[i] = XMLNS_NAMESPACE;
      const binding = bindings.bindStrings(prefix, this.values[i] as string);
      if (prefix === '') bindings.defaultIndex = binding;
      scopes.recordDeclaration(binding);
    }
  }

  /**
   * Resolves the prefixes of the attributes that aren't declarations, checks their expanded names are
   * unique, and lists the ones to report. `tokenizer` holds the start tag, and the text of bindings
   * still kept as offsets.
   */
  resolveNamespaces(bindings: NamespaceBindings, tokenizer: Tokenizer, showDeclarations: boolean): void {
    const seen = new Set<string>();
    let visibleCount = 0;
    for (let i = 0; i < this.count; i++) {
      if (this.isDeclaration(i)) {
        if (showDeclarations) this.visible[visibleCount++] = i;
        continue;
      }
      this.#resolvePrefixOf(i, bindings, tokenizer);
      const key = `${this.uris[i]}\u0000${this.localNames[i]}`;
      if (seen.has(key)) {
        const message = `Attribute ${this.localNames[i]} appears twice in one namespace`;
        fail(tokenizer, ErrorCode.NS_DUPLICATE_ATTRIBUTE, message, nameIndexOf(tokenizer, i));
      }
      seen.add(key);
      this.visible[visibleCount++] = i;
    }
    this.visibleCount = visibleCount;
  }

  /** Splits one attribute's name into prefix and local name, and resolves the prefix to its namespace. */
  #resolvePrefixOf(attributeIndex: number, bindings: NamespaceBindings, tokenizer: Tokenizer): void {
    const name = this.names[attributeIndex] as string;
    const colon = name.indexOf(':');
    if (colon === -1) return;
    const prefix = name.slice(0, colon);
    const local = name.slice(colon + 1);
    const at = nameIndexOf(tokenizer, attributeIndex);
    if (prefix === '' || !isNcName(local)) fail(tokenizer, ErrorCode.NS_QNAME, `${name} is not a qualified name`, at);
    const { buffer, bufferOffset } = tokenizer;
    const binding = bindings.findBindingOf(prefix, buffer, bufferOffset);
    if (binding < 0 || bindings.isEmpty(binding))
      fail(tokenizer, ErrorCode.NS_UNBOUND_PREFIX, `The prefix ${prefix} is not bound`, at);
    this.prefixes[attributeIndex] = prefix;
    this.localNames[attributeIndex] = local;
    this.uris[attributeIndex] = bindings.uri(binding, buffer, bufferOffset);
  }
}

/** The buffer index of the name of a listed attribute in the start tag `tokenizer` holds; the tag's start for a defaulted one. */
function nameIndexOf(tokenizer: Tokenizer, attributeIndex: number): number {
  const isInTag = attributeIndex < tokenizer.attributeCount;
  return isInTag ? (tokenizer.attributeNameStart[attributeIndex] as number) : tokenizer.tokenStart;
}

/** Checks a namespace declaration against the reserved prefixes and namespaces (Namespaces §3); `at` is where to report it. */
function checkDeclaration(tokenizer: Tokenizer, prefix: string, uri: string, at: number): void {
  const problem = reservedBindingProblem(prefix, uri);
  if (problem !== undefined) fail(tokenizer, ErrorCode.NS_RESERVED, problem, at);
  if (prefix !== '' && uri === '' && !tokenizer.version11) {
    fail(tokenizer, ErrorCode.NS_UNDECLARED_PREFIX, UNDECLARING_PROBLEM, at);
  }
}
