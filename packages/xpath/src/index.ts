export type { Converter, Converters } from './api/converters.ts';
export { InvalidArgumentError } from '@exemplarjs/xml';
export type {
  CollectionMember,
  CollectionResolution,
  CollectionResolver,
  EvaluationOptions,
  ResourceSettings,
  TemporalSettings,
} from './api/evaluation-options.ts';
export type { EvaluationArguments, JsValueOf, VariableDeclarations, VariableValues } from './api/variable-types.ts';
export { type CompileOptions, XPathCompiler, type XPathCompilerOptions } from './api/xpath-compiler.ts';
export { type TextPosition, type TextSpan, XPathErrorCode, XPathException } from './api/xpath-exception.ts';
export { XPathExecutable } from './api/xpath-executable.ts';
export { collectionMap } from './resolvers/collection-map.ts';
export { PromiseNotAwaitedError } from './runtime/resources.ts';
