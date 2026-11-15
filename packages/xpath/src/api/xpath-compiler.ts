import { COLLATION_FUNCTIONS } from '@/functions/collations/collation-functions';
import { coreLibrary } from '@/functions/core/index';
import type { FunctionLibrary } from '@/functions/function-library';
import { ALL_GROUPS } from '@/groups/index';
import { XPathCompilerBase, type XPathCompilerOptions } from './xpath-compiler-base.ts';

export type { CompileOptions, XPathCompilerOptions } from './xpath-compiler-base.ts';

/** The function library every full compiler shares, every group in it, made on first use. */
let sharedLibrary: FunctionLibrary | undefined;

/** The shared function library. */
function functionLibrary(): FunctionLibrary {
  sharedLibrary ??= coreLibrary().add(...COLLATION_FUNCTIONS, ...ALL_GROUPS.flatMap((group) => group.functions));
  return sharedLibrary;
}

/**
 * Compiles XPath 3.1 expressions, once each, into executables that run them as often as needed,
 * each with the compiler's static context and every XPath function.
 *
 * @example
 * const compiler = new XPathCompiler({ namespaces: { dc: 'http://purl.org/dc/elements/1.1/' } });
 * const titles = compiler.compile('//book[price > $min]/dc:title', { variables: { min: 'xs:integer' } });
 * for (const title of titles.select(doc, { variables: { min: 10 } })) console.log(title.stringValue);
 *
 * `Custom` names the classes its converters turn into atomic values, which variables then take:
 * `new XPathCompiler<Money>({ converters })`.
 */
export class XPathCompiler<Custom = never> extends XPathCompilerBase<Custom> {
  constructor(options: XPathCompilerOptions = {}) {
    super(options, functionLibrary());
  }
}
