import { XS_NAMESPACE } from '@exemplarjs/xdm';
import { XML_NAMESPACE } from '@exemplarjs/xml/internal';
import type { Collation } from '@/functions/collations/collation';
import type { FunctionLibrary } from '@/functions/function-library';
import type { CompilerState } from './compiler-state.ts';
import type { SequenceTypeMatcher } from './matchers.ts';

/** The namespace of the standard functions. */
export const FN_NAMESPACE = 'http://www.w3.org/2005/xpath-functions';
/** The namespace of the math functions. */
const MATH_NAMESPACE = 'http://www.w3.org/2005/xpath-functions/math';
/** The namespace of the standard error codes. */
export const ERROR_NAMESPACE = 'http://www.w3.org/2005/xqt-errors';

/** The default language, which `default-language()` reports and collations and formatting use when given none. */
export const DEFAULT_LANGUAGE = 'en';

/** Whether an `Intl` service, such as `Intl.Collator`, has a locale for a language; false for one that is not a language tag. */
export function intlSupports(service: { supportedLocalesOf(locales: string[]): string[] }, language: string): boolean {
  try {
    return service.supportedLocalesOf([language]).length > 0;
  } catch {
    return false;
  }
}

/** The namespaces every expression knows, by prefix. */
export const DEFAULT_NAMESPACES: Readonly<Record<string, string>> = {
  xml: XML_NAMESPACE,
  xs: XS_NAMESPACE,
  xsi: 'http://www.w3.org/2001/XMLSchema-instance',
  fn: FN_NAMESPACE,
  math: MATH_NAMESPACE,
  map: 'http://www.w3.org/2005/xpath-functions/map',
  array: 'http://www.w3.org/2005/xpath-functions/array',
  err: ERROR_NAMESPACE,
};

/** What resolving names needs: the prefixes in scope, the default element namespace and the text, for error positions. */
export interface NamespaceContext {
  /** The namespace a prefix is bound to, or undefined. */
  resolvePrefix(prefix: string): string | undefined;

  readonly defaultElementNamespace: string;
  /** The expression's text, so that errors can say where they were found. */
  readonly text: string;
}

/** A variable declared to the compiler: its slot in the dynamic context, and its type when declared. */
export interface DeclaredVariable {
  readonly slot: number;
  readonly type: SequenceTypeMatcher | undefined;
}

/** A name with its namespace URI, written `Q{uri}local`, as a key and as an EQName. */
export function expandedKey(name: { readonly namespaceURI: string; readonly localName: string }): string {
  return `Q{${name.namespaceURI}}${name.localName}`;
}

/**
 * The static context an expression compiles in: its namespaces, default namespaces, base URI,
 * functions and declared variables.
 */
export class StaticContext implements NamespaceContext {
  readonly text: string;
  readonly defaultElementNamespace: string;
  readonly baseURI: string | undefined;
  /** The collation that compares strings where an expression names none. */
  readonly defaultCollation: Collation;
  readonly functions: FunctionLibrary;
  /** The declared variables, by expanded key. */
  readonly variables: ReadonlyMap<string, DeclaredVariable>;
  /** What the compiler keeps for every expression it compiles, such as the collations their URIs name. */
  readonly compilerState: CompilerState;
  readonly #namespaces: ReadonlyMap<string, string>;

  constructor(options: {
    text: string;
    namespaces: ReadonlyMap<string, string>;
    defaultElementNamespace: string;
    baseURI: string | undefined;
    defaultCollation: Collation;
    functions: FunctionLibrary;
    variables: ReadonlyMap<string, DeclaredVariable>;
    compilerState: CompilerState;
  }) {
    this.text = options.text;
    this.#namespaces = options.namespaces;
    this.defaultElementNamespace = options.defaultElementNamespace;
    this.baseURI = options.baseURI;
    this.defaultCollation = options.defaultCollation;
    this.functions = options.functions;
    this.variables = options.variables;
    this.compilerState = options.compilerState;
  }

  resolvePrefix(prefix: string): string | undefined {
    return this.#namespaces.get(prefix);
  }
}
