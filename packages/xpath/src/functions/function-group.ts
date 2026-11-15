import type { FunctionDefinition } from './function-library.ts';

/**
 * A group of functions a lean compiler can be given, such as the date and time functions, so
 * that a bundle carries only the groups its expressions call. The full entry has every group.
 *
 * @example
 * import { XPathCompiler } from '@exemplarjs/xpath/lean';
 * import { regexFunctions } from '@exemplarjs/xpath/groups/regex';
 * new XPathCompiler({ functions: [regexFunctions] }).compile('matches($s, "^a")', { variables: ['s'] });
 */
export interface FunctionGroup {
  /** The group's name, as an XPST0017 for one of its functions names it. */
  readonly name: string;
  readonly functions: readonly FunctionDefinition[];
}
