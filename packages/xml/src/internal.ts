/** Hooks and helpers the other exemplar packages share; not part of the public API. */
export {
  ADD_FILTER,
  ANCESTOR_XML_ATTRIBUTES,
  CREATE_READER,
  DTD_COMPLETE,
  DTD_ITEMS,
  EVENT_OFFSET,
  EVENT_POSITION,
  type EntityListener,
  HAS_FILTERS,
  INCLUDED_DECLARATIONS,
  LISTEN_ENTITIES,
  NAMESPACES_IN_SCOPE,
  READER_OPTIONS,
  copyString,
  isIndex,
  outOfRange,
} from './cursor/internal.ts';
export { isCharacterData } from './cursor/event-type.ts';
export { StreamReader, isReader } from './cursor/stream-reader.ts';
export { cursorOf } from './filters/delegate.ts';
export { ReaderInput } from './cursor/reader-input.ts';
export {
  NOWHERE,
  type SAXAttributes,
  type SAXLocator,
  StructureCheck,
  attributeIndex,
  locationOf,
} from './util/structure.ts';
export { EventDispatcher, declareEntity } from './events/event-dispatch.ts';
export type { DocumentValidator, ValidationContext, Validator } from './cursor/validation.ts';
export type { ResolvedOptions } from './config/options.ts';
export { DecodeError, UNDEFINED_CHARACTER, UTF16_UNIT_BYTES, withCarry } from './encodings/decoders.ts';
export { SINGLE_BYTE_TABLES } from './encodings/tables.ts';
export { unmatchedByCatalog } from './entities/external.ts';
export { type DecoderRegistry, canonicalEncoding } from './input/decoders.ts';
export { detect } from './input/detect.ts';
export {
  type AsyncOpenedSource,
  type ByteStream,
  type OpenedSource,
  openSource,
  readStream,
  sourceObjectOf,
} from './input/source.ts';
export { accessAllows, accessRefusedError, orElse, resolverMissingError } from './resolvers/resolver.ts';
export type { LineSegment } from './tokenizer/lines.ts';

// The shared helpers in src/util.
export {
  BYTE_BITS,
  BYTE_MASK,
  BYTE_ORDER_MARK,
  BYTE_VALUES,
  HEX_DIGITS_PER_BYTE,
  NO_BYTES,
  startsWithBytes,
} from './util/bytes.ts';
export { ErrorFactory } from './util/errors.ts';
export {
  CODE_UNIT_HEX_DIGITS,
  Char,
  SURROGATE_PAIR_LENGTH,
  Unicode,
  byCodePoint,
  byCodeUnit,
  codePointLabel,
  codePointOf,
  holdsNonChar,
  isAsciiDigit,
  isChar,
  isHighSurrogate,
  isLowSurrogate,
  isRestrictedChar,
} from './util/chars.ts';
export { Radix, upperHex } from './util/numbers.ts';
export { abandon } from './util/promises.ts';
export { GROWTH_FACTOR } from './util/arrays.ts';
export { LruCache } from './util/lru-cache.ts';
export { NameCache } from './util/name-cache.ts';
export { NameCheck } from './util/name-check.ts';
export { startsWithDeclaration } from './tokenizer/declaration.ts';
export {
  isNameChar,
  isNameStartChar,
  isNcName,
  isNmtoken,
  isXmlName,
  lexicalQNameParts,
  localPartOf,
  prefixOf,
  splitQName,
} from './util/names.ts';
export {
  XML_NAMESPACE,
  XMLNS_NAMESPACE,
  declarationName,
  declaredPrefixOf,
  declaredPrefixes,
  reservedBindingProblem,
  namespacesInScope,
} from './util/namespaces.ts';
export { type NodeLike, NodeType, attributesOf, prefixDeclaredBy } from './util/nodes.ts';
export { checkRegexFlags, type TranslatedRegex, translateRegex } from './util/regex.ts';
export { RegexError } from './util/regex-error.ts';
export {
  escapeAndResolveURI,
  resolveEscapedTargetURI,
  escapeURI,
  hasScheme,
  percentEscape,
  resolveTargetURI,
  resolveURI,
} from './util/uri.ts';
export {
  collapseWhitespace,
  isAllWhitespace,
  isWhitespaceChar,
  normalizePublicId,
  splitWhitespace,
  trimWhitespace,
  WHITESPACE_CLASS,
} from './util/whitespace.ts';
