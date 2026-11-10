import { compile, type CompileState } from '@/compile/compiler';
import { codepointCollation, type Collation } from '@/functions/collations/collation';
import { resolveCollation } from '@/functions/collations/resolve-collation';
import type { FunctionLibrary } from '@/functions/function-library';
import { resolvePlainName } from '@/static/name-resolution';
import { type DeclaredVariable, DEFAULT_NAMESPACES, expandedKey, StaticContext } from '@/static/static-context';
import { sequenceTypeFromText } from '@/static/type-resolution';
import { parseXPath } from '@/syntax/parser';
import { TokenStream } from '@/syntax/token-stream';
import type { Converters } from './converters.ts';
import type { BoundVariable } from './variable-binding.ts';
import type { VariableDeclarations, VariableValues } from './variable-types.ts';
import { XPathErrorCode, xpathError } from './xpath-exception.ts';
import { XPathExecutable } from './xpath-executable.ts';

/** How a compiler compiles every expression it is given. */
export interface XPathCompilerOptions {
  /** Prefixes and the namespaces they are bound to, besides `xml`, `xs`, `xsi`, `fn`, `math`, `map`, `array` and `err`. */
  readonly namespaces?: Readonly<Record<string, string>>;
  /** The namespace of unprefixed element and type names; none by default. */
  readonly defaultElementNamespace?: string;
  /** The static base URI, which `fn:static-base-uri` and `fn:resolve-uri` use. */
  readonly baseURI?: string;
  /**
   * The collation that compares and sorts strings where an expression names none, by URI, such as
   * `http://www.w3.org/2013/collation/UCA?strength=primary`; by code points by default.
   */
  readonly defaultCollation?: string;
  /** How atomic values cross to and from JavaScript, by type name. */
  readonly converters?: Converters;
}

/** How one expression is compiled. */
export interface CompileOptions<Declared extends VariableDeclarations> {
  /** The variables the expression uses: names alone, or names with sequence types such as `'xs:integer'` or `'node()*'`. */
  readonly variables?: Declared;
}

/**
 * What the full and the lean `XPathCompiler` share: compiling an expression, once, into an
 * executable that runs it as often as needed, with the compiler's static context and the
 * functions of its library.
 */
export class XPathCompilerBase<Custom = never> {
  readonly #options: XPathCompilerOptions;
  readonly #namespaces: ReadonlyMap<string, string>;
  readonly #defaultCollation: Collation;
  /** The functions expressions can call. */
  protected readonly library: FunctionLibrary;

  constructor(options: XPathCompilerOptions, library: FunctionLibrary) {
    this.#options = options;
    this.#namespaces = new Map(Object.entries({ ...DEFAULT_NAMESPACES, ...options.namespaces }));
    this.library = library;
    const collation = options.defaultCollation;
    this.#defaultCollation =
      collation === undefined ? codepointCollation : resolveCollation(collation, options.baseURI);
  }

  /** The static context an expression is compiled in, with the compiler's namespaces, base URI and functions. */
  protected staticContext(expression: string, variables: ReadonlyMap<string, DeclaredVariable>): StaticContext {
    return new StaticContext({
      text: expression,
      namespaces: this.#namespaces,
      defaultElementNamespace: this.#options.defaultElementNamespace ?? '',
      baseURI: this.#options.baseURI,
      defaultCollation: this.#defaultCollation,
      functions: this.library,
      variables,
    });
  }

  /** Compiles an expression; raises an XPathException for a static error, such as XPST0003 for bad syntax. */
  compile<const Declared extends VariableDeclarations = readonly []>(
    expression: string,
    options: CompileOptions<Declared> = {}
  ): XPathExecutable<VariableValues<Declared, Custom>> {
    const syntax = parseXPath(expression);
    const variables = this.#declare(options.variables ?? []);
    const declared = new Map<string, DeclaredVariable>(variables.map((variable) => [variable.key, variable]));
    const context = this.staticContext(expression, declared);
    const state: CompileState = {
      context,
      scope: undefined,
      slotCount: variables.length,
      resourceURIs: [],
      operands: undefined,
      positionFree: new Map(),
    };
    const evaluator = compile(syntax, state);
    return new XPathExecutable({
      evaluator,
      slotCount: state.slotCount,
      variables,
      staticContext: context,
      converters: this.#options.converters ?? {},
      resourceURIs: state.resourceURIs,
    });
  }

  /** The declared variables, each with its expanded key, its slot and its compiled type. */
  #declare(declarations: VariableDeclarations): (BoundVariable & DeclaredVariable & { key: string })[] {
    const entries: [string, string | undefined][] = Array.isArray(declarations)
      ? (declarations as readonly string[]).map((name) => [name, undefined])
      : Object.entries(declarations as Readonly<Record<string, string>>);
    return entries.map(([name, type], slot) => {
      const tokens = new TokenStream(name);
      const resolved = resolvePlainName(tokens.expectName('a variable name'), {
        text: name,
        defaultElementNamespace: '',
        resolvePrefix: this.#resolvePrefix,
      });
      if (!tokens.atEnd)
        xpathError(
          XPathErrorCode.SYNTAX_ERROR,
          `"${name}" is not a variable name`,
          { start: 0, end: name.length },
          name
        );
      return { name, slot, key: expandedKey(resolved), type: this.#compileType(type) };
    });
  }

  /** A declared variable's type, compiled with the compiler's namespaces. */
  #compileType(type: string | undefined): DeclaredVariable['type'] {
    if (type === undefined) return undefined;
    return sequenceTypeFromText(type, this.#resolvePrefix, this.#options.defaultElementNamespace);
  }

  /** The namespace a prefix is bound to among the compiler's namespaces. */
  readonly #resolvePrefix = (prefix: string): string | undefined => this.#namespaces.get(prefix);
}
