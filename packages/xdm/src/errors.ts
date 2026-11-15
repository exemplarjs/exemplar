import { ErrorFactory } from '@exemplarjs/xml/internal';

/** The standard error codes the data model and the XPath processor raise, by what they mean; each value is the code XPath or F&O defines. */
export const XPathErrorCode = {
  /** A value that cannot be cast to the target type, such as `'abc'` to `xs:integer`. */
  INVALID_VALUE_FOR_CAST: 'FORG0001',
  /** NaN or an infinity cast to `xs:decimal` or `xs:integer`. */
  NOT_A_FINITE_NUMBER: 'FOCA0002',
  /** Integer or decimal division, or `idiv` or `mod`, by zero. */
  DIVISION_BY_ZERO: 'FOAR0001',
  /** A result outside the range a type can hold, such as `idiv` of an infinity. */
  NUMERIC_OVERFLOW: 'FOAR0002',
  /** An operation on values of types it does not accept. */
  TYPE_MISMATCH: 'XPTY0004',
  /** A cast to `xs:anyAtomicType` or `xs:NOTATION`, which no value can have. */
  CAST_TO_ABSTRACT_TYPE: 'XPST0080',
  /** A QName prefix with no namespace bound to it. */
  UNBOUND_QNAME_PREFIX: 'FONS0004',
  /** A date or time out of the range of years exemplar supports, as a result of arithmetic or a cast. */
  DATE_TIME_OVERFLOW: 'FODT0001',
  /** A duration out of the range exemplar supports, or an infinite one from multiplication or division. */
  DURATION_OVERFLOW: 'FODT0002',
  /** NaN given where a number must have a value, such as multiplying a duration by NaN. */
  NAN_NOT_ALLOWED: 'FOCA0005',
  // What compiling and running an expression raises.
  /** An expression that does not follow the grammar, such as `1 +` or `10div 3`. */
  SYNTAX_ERROR: 'XPST0003',
  /** A name that is not declared: a variable such as `$undeclared`, or a schema type or declaration. */
  UNDECLARED_NAME: 'XPST0008',
  /** A function that is not declared with that name and number of arguments. */
  UNKNOWN_FUNCTION: 'XPST0017',
  /** A type name that is not a known atomic type, as in `cast as xs:nonsense`. */
  UNKNOWN_TYPE: 'XPST0051',
  /** A prefix that is not bound to a namespace. */
  UNBOUND_PREFIX: 'XPST0081',
  /** A name in the namespace reserved for namespace declarations, `http://www.w3.org/2000/xmlns/`. */
  RESERVED_NAMESPACE: 'XQST0070',
  /** An expression that needs the context item when there is none. */
  NO_CONTEXT_ITEM: 'XPDY0002',
  /** A path step whose context item is not a node. */
  CONTEXT_NOT_A_NODE: 'XPTY0020',
  /** A path whose last step gives both nodes and atomic values. */
  MIXED_PATH_RESULT: 'XPTY0018',
  /** A step before the last that gives atomic values, as `(1, 2)/a` does. */
  STEP_NOT_NODES: 'XPTY0019',
  /** `treat as` given a value that does not match the type. */
  TREAT_MISMATCH: 'XPDY0050',
  /** `/` when the context node's tree has no document at its root. */
  ROOT_NOT_A_DOCUMENT: 'XPDY0050',
  /** `fn:error` called without an error code. */
  USER_ERROR: 'FOER0000',
  /** A sequence of more than one item where one is allowed. */
  MORE_THAN_ONE_ITEM: 'FORG0003',
  /** An empty sequence where one or more items are needed. */
  EMPTY_SEQUENCE_GIVEN: 'FORG0004',
  /** A sequence that is not exactly one item. */
  NOT_EXACTLY_ONE: 'FORG0005',
  /** An argument of the wrong type for a function, such as `sum(('a', 'b'))`. */
  INVALID_ARGUMENT_TYPE: 'FORG0006',
  /** The effective boolean value of a sequence that has none, such as `boolean((1, 2))`. */
  NO_BOOLEAN_VALUE: 'FORG0006',
  /** An item that cannot be atomized, such as a function. */
  NOT_ATOMIZABLE: 'FOTY0013',
  /** A code point that is not a character, as in `codepoints-to-string(0)`. */
  INVALID_CODE_POINT: 'FOCH0001',
  /** The string value of a function item, which has none. */
  FUNCTION_HAS_NO_STRING: 'FOTY0014',
  /** A function item given to `fn:deep-equal`, which cannot compare functions. */
  FUNCTION_NOT_COMPARABLE: 'FOTY0015',
  /** `fn:apply` given an array of arguments whose size is not the function's arity. */
  WRONG_ARGUMENT_COUNT: 'FOAP0001',
  /** An array position outside the array, as in `[1, 2](3)`. */
  ARRAY_INDEX_OUT_OF_BOUNDS: 'FOAY0001',
  /** A negative length for `array:subarray`. */
  NEGATIVE_ARRAY_LENGTH: 'FOAY0002',
  /** A map constructor that gives one key twice, as in `map { 1: 'a', 1.0: 'b' }`. */
  DUPLICATE_MAP_KEY: 'XQDY0137',
  /** An inline function with two parameters of one name. */
  DUPLICATE_PARAMETER: 'XQST0039',
  /** Text `parse-json` cannot read as JSON. */
  INVALID_JSON: 'FOJS0001',
  /** JSON or maps to merge that give one key twice, where the options reject duplicates. */
  DUPLICATE_JSON_KEY: 'FOJS0003',
  /** `json-to-xml` asked to validate, which needs a schema-aware processor. */
  JSON_VALIDATION_UNSUPPORTED: 'FOJS0004',
  /** An options map with a value an option does not allow. */
  INVALID_OPTION: 'FOJS0005',
  /** An XML document that is not the XML representation of JSON, for `xml-to-json`. */
  INVALID_JSON_XML: 'FOJS0006',
  /** A JSON string with a backslash escape that is not one, where escapes are kept. */
  INVALID_JSON_ESCAPE: 'FOJS0007',
  /** `load-xquery-module` called where no XQuery processor is available. */
  NO_XQUERY_PROCESSOR: 'FOQM0006',
  /** `transform` called where no XSLT processor is available. */
  NO_XSLT_PROCESSOR: 'FOXT0004',
  /** A collation the processor does not support. */
  UNSUPPORTED_COLLATION: 'FOCH0002',
  /** A normalization form the processor does not support. */
  UNSUPPORTED_NORMALIZATION_FORM: 'FOCH0003',
  /** A prefix with no namespace in an element's scope, for `resolve-QName`. */
  NO_NAMESPACE_FOR_PREFIX: 'FONS0004',
  /** A relative URI resolved without a base URI. */
  NO_BASE_URI: 'FONS0005',
  /** A string that is not a valid URI, for `resolve-uri`. */
  INVALID_URI: 'FORG0002',
  /** An ID or IDREF lookup in a tree without a document at its root. */
  NOT_IN_A_DOCUMENT: 'FODC0001',
  /** A document or collection that cannot be read, as no resolver supplies it or it is not well-formed. */
  RESOURCE_NOT_READ: 'FODC0002',
  /** A collection URI that is not a valid URI. */
  INVALID_COLLECTION_URI: 'FODC0004',
  /** A document URI that is not a valid URI. */
  INVALID_DOCUMENT_URI: 'FODC0005',
  /** A string given to `parse-xml` or `parse-xml-fragment` that is not well-formed. */
  NOT_WELL_FORMED: 'FODC0006',
  /** A text resource that cannot be read: an invalid URI, one with a fragment, or one no resolver supplies. */
  TEXT_NOT_READ: 'FOUT1170',
  /** A text resource whose encoding is not supported, or whose text has characters XML cannot hold. */
  TEXT_NOT_DECODED: 'FOUT1190',
  /** An item the output method cannot write, such as an attribute node or a function item for the XML method. */
  NOT_SERIALIZABLE: 'SENR0001',
  /** A serialization parameter with a value it cannot have, such as an unknown method in a parameters map. */
  INVALID_SERIALIZATION_VALUE: 'SEPM0016',
  /** A serialization parameters element that is not as Serialization 3.1 defines it. */
  INVALID_SERIALIZATION_ELEMENT: 'SEPM0017',
  /** A character a character map maps more than once. */
  DUPLICATE_CHARACTER_MAPPING: 'SEPM0018',
  /** A serialization parameter a parameters element sets more than once. */
  DUPLICATE_SERIALIZATION_PARAMETER: 'SEPM0019',
  /** `undeclare-prefixes` asked of XML 1.0 output, which cannot undeclare a prefix. */
  UNDECLARE_PREFIXES_IN_XML_10: 'SEPM0010',
  /** An output encoding the serializer does not support. */
  UNSUPPORTED_OUTPUT_ENCODING: 'SESU0007',
  /** A Unicode normalization form the serializer does not support. */
  UNSUPPORTED_OUTPUT_NORMALIZATION: 'SESU0011',
  /** An XML or HTML version the serializer does not support. */
  UNSUPPORTED_XML_VERSION: 'SESU0013',
  /** A character the output encoding cannot hold where no reference can stand for it, as in an HTML `script`. */
  UNENCODABLE_CHARACTER: 'SERE0008',
  /** A control character from #x7F to #x9F in HTML before HTML5, which cannot hold one. */
  HTML_CONTROL_CHARACTER: 'SERE0014',
  /** A `>` in an HTML processing instruction, which ends at the first `>`. */
  HTML_PI_GREATER_THAN: 'SERE0015',
  /** NaN or an infinity, which JSON has no number for. */
  NUMBER_NOT_IN_JSON: 'SERE0020',
  /** An item JSON has no form for, such as a function item. */
  ITEM_NOT_IN_JSON: 'SERE0021',
  /** Two keys of a map that the JSON method writes as the same name. */
  DUPLICATE_JSON_NAME: 'SERE0022',
  /** More than one item where the JSON method writes one value. */
  SEQUENCE_NOT_IN_JSON: 'SERE0023',
  /** An untyped value where a QName is needed, which has no namespaces to resolve its prefix by. */
  UNTYPED_TO_QNAME: 'XPTY0117',
  /** A function reference with more arguments than any call can have. */
  ARITY_OVERFLOW: 'FOAR0002',
  /** A value too large for this processor, such as a range of billions of integers. */
  IMPLEMENTATION_LIMIT: 'XPDY0130',
  /** A string that is not a lexical QName, for `fn:QName` and `resolve-QName`. */
  INVALID_LEXICAL_QNAME: 'FOCA0002',
  /** A date and a time with different timezones joined by `fn:dateTime`. */
  CONFLICTING_TIMEZONES: 'FORG0008',
  /** A string `fn:parse-ietf-date` cannot read as a date. */
  INVALID_IETF_DATE: 'FORG0010',
  /** A collation `collation-key` was asked for keys of that cannot give them. */
  COLLATION_KEYS_UNSUPPORTED: 'FOCH0004',
  /** A timezone more than 14 hours from UTC, or not a whole number of minutes. */
  INVALID_TIMEZONE: 'FODT0003',
  /** Flags a regular expression function does not know. */
  INVALID_REGEX_FLAGS: 'FORX0001',
  /** A regular expression that is not one. */
  INVALID_REGEX: 'FORX0002',
  /** A regular expression that matches the empty string, where `replace`, `tokenize` and `analyze-string` need one that cannot. */
  REGEX_MATCHES_EMPTY: 'FORX0003',
  /** A replacement string with a backslash or `$` that is not part of an escape or a group reference. */
  INVALID_REPLACEMENT: 'FORX0004',
  /** A decimal format name that names no decimal format, for `format-number`. */
  UNKNOWN_DECIMAL_FORMAT: 'FODF1280',
  /** A picture `format-integer` or `format-number` cannot use, such as `'0,000,'` or `'#.#.#'`. */
  INVALID_NUMBER_PICTURE: 'FODF1310',
  /** A picture or calendar `format-date` and its kin cannot use, such as `'[bla]'` or `'[Y'`. */
  INVALID_DATE_TIME_PICTURE: 'FOFD1340',
  /** A component a value lacks, such as `[H]` for a date. */
  UNAVAILABLE_DATE_TIME_COMPONENT: 'FOFD1350',
} as const;

export type XPathErrorCode = (typeof XPathErrorCode)[keyof typeof XPathErrorCode];

/** An error the data model raises, with its standard code, such as `FORG0001`. */
export class XdmError extends Error {
  readonly code: XPathErrorCode;
  /** The message without its code. */
  readonly description: string;

  constructor(code: XPathErrorCode, message: string) {
    super(`${code}: ${message}`);
    this.name = 'XdmError';
    this.code = code;
    this.description = message;
  }
}

/** Values of two types that cannot be compared, or not ordered: XPTY0004. */
export function notComparable(first: { toString(): string }, second: { toString(): string }, how = 'compared'): never {
  return xdmError(
    XPathErrorCode.TYPE_MISMATCH,
    `Values of types ${first.toString()} and ${second.toString()} cannot be ${how}`
  );
}

/** Throws an XdmError, without a stack trace, as exemplar's errors raised on purpose have none. */
export function xdmError(code: XPathErrorCode, message: string): never {
  throw ErrorFactory.create(XdmError, code, message);
}
