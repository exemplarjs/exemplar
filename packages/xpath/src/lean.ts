/**
 * `@exemplarjs/xpath/lean`: an XPath compiler that has only the function groups it is given, so
 * that a bundle carries only the functions its expressions call. `compileAsync` loads the groups
 * an expression calls that the compiler lacks.
 */

import type { VariableDeclarations, VariableValues } from '@/api/variable-types';
import { type CompileOptions, XPathCompilerBase, type XPathCompilerOptions } from '@/api/xpath-compiler-base';
import type { XPathExecutable } from '@/api/xpath-executable';
import { COLLATION_FUNCTIONS } from '@/functions/collations/collation-functions';
import { coreLibrary } from '@/functions/core';
import type { FunctionGroup } from '@/functions/function-group';
import { GROUP_FUNCTIONS, GROUP_MODULES, type GroupModule } from '@/lean/group-index';
import { resolveFunctionName } from '@/static/name-resolution';
import { DEFAULT_NAMESPACES, expandedKey } from '@/static/static-context';
import { parseXPath } from '@/syntax/parser';
import { functionNames } from '@/syntax/syntax-walk';

export { InvalidArgumentError } from '@exemplarjs/xml';
export type { Converter, Converters } from '@/api/converters';
export type {
  CollectionMember,
  CollectionResolution,
  CollectionResolver,
  EvaluationOptions,
  ResourceSettings,
  TemporalSettings,
} from '@/api/evaluation-options';
export type { EvaluationArguments, JsValueOf, VariableDeclarations, VariableValues } from '@/api/variable-types';
export type { CompileOptions, XPathCompilerOptions } from '@/api/xpath-compiler-base';
export { type TextPosition, type TextSpan, XPathErrorCode, XPathException } from '@/api/xpath-exception';
export { XPathExecutable } from '@/api/xpath-executable';
export type { FunctionGroup } from '@/functions/function-group';
export { collectionMap } from '@/resolvers/collection-map';
export { PromiseNotAwaitedError } from '@/runtime/resources';

/** How a lean compiler compiles: as a full one does, with the function groups it has besides the core functions. */
export interface LeanXPathCompilerOptions extends XPathCompilerOptions {
  readonly functions?: readonly FunctionGroup[];
}

/** The group of each function a group holds, by `Q{uri}local`. */
const GROUP_OF = new Map(
  Object.entries(GROUP_FUNCTIONS).flatMap(([group, names]) =>
    names.map((name) => {
      const [prefix, localName] = name.includes(':') ? name.split(':') : ['fn', name];
      const namespaceURI = DEFAULT_NAMESPACES[prefix as string] as string;
      return [expandedKey({ namespaceURI, localName: localName as string }), group] as const;
    })
  )
);

/** What an XPST0017 adds for a function a lean compiler lacks: the group to add, or undefined for a function in none. */
function explainMissing(namespaceURI: string, localName: string): string | undefined {
  const group = GROUP_OF.get(expandedKey({ namespaceURI, localName }));
  if (group === undefined) return undefined;
  const name = (GROUP_MODULES[group] as GroupModule).exportName;
  return `it is in the ${group} group; add ${name} from @exemplarjs/xpath/groups/${group} to the compiler's functions, or compile with compileAsync`;
}

/**
 * Compiles XPath 3.1 expressions as the full `XPathCompiler` does, with the core functions and
 * the function groups it is given, such as `regexFunctions` from `@exemplarjs/xpath/groups/regex`.
 * A call to a function in a group it lacks raises XPST0017 naming the group; `compileAsync` loads
 * such groups first, each from a module of its own.
 *
 * @example
 * import { XPathCompiler } from '@exemplarjs/xpath/lean';
 * import { regexFunctions } from '@exemplarjs/xpath/groups/regex';
 * const compiler = new XPathCompiler({ functions: [regexFunctions] });
 * compiler.compile('matches($s, "^a")', { variables: ['s'] });
 * await compiler.compileAsync('format-number($n, "#,##0")', { variables: ['n'] }); // loads the formatting group
 */
export class XPathCompiler<Custom = never> extends XPathCompilerBase<Custom> {
  /** The names of the groups the compiler has. */
  readonly #groups = new Set<string>();

  constructor(options: LeanXPathCompilerOptions = {}) {
    super(options, coreLibrary(explainMissing).add(...COLLATION_FUNCTIONS));
    for (const group of options.functions ?? []) this.#add(group);
  }

  /** Adds a group's functions, once. */
  #add(group: FunctionGroup): void {
    if (this.#groups.has(group.name)) return;
    this.#groups.add(group.name);
    this.library.add(...group.functions);
  }

  /**
   * Compiles an expression as `compile` does, first loading, together, the groups of the functions
   * it calls or names that the compiler lacks. A function `function-lookup` finds by a name it
   * computes is found only when its group is loaded already.
   */
  async compileAsync<const Declared extends VariableDeclarations = readonly []>(
    expression: string,
    options: CompileOptions<Declared> = {}
  ): Promise<XPathExecutable<VariableValues<Declared, Custom>>> {
    const context = this.staticContext(expression, new Map());
    const missing = new Set<string>();
    for (const name of functionNames(parseXPath(expression))) {
      const resolved = resolveFunctionName(name, context);
      const group = GROUP_OF.get(expandedKey(resolved));
      if (group !== undefined && !this.#groups.has(group)) missing.add(group);
    }
    const loaded = await Promise.all([...missing].map((group) => (GROUP_MODULES[group] as GroupModule).load()));
    for (const group of loaded) this.#add(group);
    return this.compile(expression, options);
  }
}
