import {
  Decimal,
  isAtomicValue,
  isMap,
  isNode,
  namespaceForPrefix,
  NodeKind,
  type XdmAtomicValue,
  type XdmItem,
  type XdmMap,
  type XdmNode,
  type XdmValue,
} from '@exemplarjs/xdm';
import { QName } from '@exemplarjs/xml';
import { splitWhitespace, trimWhitespace } from '@exemplarjs/xml/internal';
import { dynamicError, XPathErrorCode } from '@/api/xpath-exception';
import { characterCount, isTrue } from '@/functions/core/values';
import { optionValue } from '@/functions/options';
import { sequenceTypeOf } from '@/functions/signatures';
import type { SequenceTypeMatcher } from '@/static/matchers';
import { splitEQName } from '@/static/name-resolution';
import { expandedKey } from '@/static/static-context';

/** The namespace of serialization parameter elements. */
const OUTPUT_NAMESPACE = 'http://www.w3.org/2010/xslt-xquery-serialization';

/** The output methods Serialization 3.1 defines. */
const OUTPUT_METHODS = ['xml', 'xhtml', 'html', 'text', 'json', 'adaptive'] as const;

/** The `html-version` of HTML5, the default and the latest the HTML method writes. */
export const HTML5_VERSION = 5;
export type OutputMethod = (typeof OUTPUT_METHODS)[number];

/** How a parameter is read: its type in a parameters map, and how an element's `value` attribute reads as it. */
type ParameterKind = 'boolean' | 'string' | 'names' | 'decimal' | 'method' | 'standalone' | 'character-map';

/** Each serialization parameter Serialization 3.1 defines, by name, and how it is read. */
const PARAMETERS: Readonly<Record<string, ParameterKind>> = {
  'allow-duplicate-names': 'boolean',
  'byte-order-mark': 'boolean',
  'cdata-section-elements': 'names',
  'doctype-public': 'string',
  'doctype-system': 'string',
  encoding: 'string',
  'escape-uri-attributes': 'boolean',
  'html-version': 'decimal',
  'include-content-type': 'boolean',
  indent: 'boolean',
  'item-separator': 'string',
  'json-node-output-method': 'method',
  'media-type': 'string',
  method: 'method',
  'normalization-form': 'string',
  'omit-xml-declaration': 'boolean',
  standalone: 'standalone',
  'suppress-indentation': 'names',
  'undeclare-prefixes': 'boolean',
  'use-character-maps': 'character-map',
  version: 'string',
};

/** A parameter's value as read from a map or an element, before the defaults are filled in. */
type ParameterValue = boolean | string | readonly string[] | ReadonlyMap<string, string> | undefined;

/** A Unicode normalization form, as `String.prototype.normalize` takes it. */
type NormalizationForm = 'NFC' | 'NFD' | 'NFKC' | 'NFKD';

/** What a serialization is asked for, every parameter's default filled in; element names are `{uri}local`. */
export interface SerializationParameters {
  readonly method: OutputMethod;
  readonly allowDuplicateNames: boolean;
  readonly cdataSectionElements: readonly string[];
  readonly doctypePublic: string | undefined;
  readonly doctypeSystem: string | undefined;
  readonly encoding: string;
  readonly escapeURIAttributes: boolean;
  readonly htmlVersion: number;
  readonly includeContentType: boolean;
  readonly indent: boolean;
  /** The string written between items; undefined writes a space between adjacent atomic values only. */
  readonly itemSeparator: string | undefined;
  readonly jsonNodeOutputMethod: OutputMethod;
  /** The media type the HTML and XHTML methods' content type `meta` element names, or undefined for `text/html`. */
  readonly mediaType: string | undefined;
  /** A normalization form for `String.prototype.normalize`, or undefined for none. */
  readonly normalizationForm: NormalizationForm | undefined;
  readonly omitXMLDeclaration: boolean;
  /** The standalone declaration to write, or undefined to write none. */
  readonly standalone: boolean | undefined;
  readonly suppressIndentation: readonly string[];
  readonly undeclarePrefixes: boolean;
  readonly characterMap: ReadonlyMap<string, string>;
  readonly version: string;
}

/** Raises SEPM0017, for a parameters element that is not as Serialization 3.1 defines it. */
function invalidElement(message: string): never {
  return dynamicError(XPathErrorCode.INVALID_SERIALIZATION_ELEMENT, message);
}

/** Raises SEPM0016, for a parameter value it cannot have. */
function invalidValue(name: string, value: string): never {
  return dynamicError(
    XPathErrorCode.INVALID_SERIALIZATION_VALUE,
    `The serialization parameter ${name} cannot be "${value}"`
  );
}

/** An element name as the writer takes it, and the parameters hold names: `{uri}local`. */
export function expandedName(name: { readonly namespaceURI: string; readonly localName: string }): string {
  return `{${name.namespaceURI}}${name.localName}`;
}

/** The method a QName names: one in no namespace by its local name, another by its expanded name. */
function qNameMethod(method: QName): string {
  return method.namespaceURI === '' ? method.localName : expandedKey(method);
}

/** A method named in a map, as a string or a QName, one in no namespace naming a method by its local name; SEPM0016 for one it does not know. */
function methodOf(name: string, value: XdmItem | undefined): OutputMethod {
  const isAtomic = value !== undefined && isAtomicValue(value);
  const method = isAtomic ? value.value : undefined;
  if (!(method instanceof QName) && typeof method !== 'string')
    return dynamicError(XPathErrorCode.TYPE_MISMATCH, `The parameter ${name} must be a string or a QName`);
  const text = typeof method === 'string' ? method : qNameMethod(method);
  return (OUTPUT_METHODS as readonly string[]).includes(text) ? (text as OutputMethod) : invalidValue(name, text);
}

/** A character map from a parameters map: single characters to strings; SEPM0016 for a key of another length. */
function characterMapOf(value: XdmMap): ReadonlyMap<string, string> {
  const mapping = new Map<string, string>();
  for (const [key, replacement] of value.entries()) {
    const character = String(key.value);
    if (characterCount(character) !== 1) invalidValue('use-character-maps', character);
    mapping.set(character, String((replacement[0] as XdmAtomicValue).value));
  }
  return mapping;
}

/** The type a parameter's value must have in a parameters map. */
const MAP_TYPES: Readonly<Record<ParameterKind, SequenceTypeMatcher>> = {
  boolean: sequenceTypeOf('xs:boolean?'),
  string: sequenceTypeOf('xs:string?'),
  names: sequenceTypeOf('xs:QName*'),
  decimal: sequenceTypeOf('xs:decimal?'),
  method: sequenceTypeOf('item()?'),
  standalone: sequenceTypeOf('xs:boolean?'),
  'character-map': sequenceTypeOf('map(xs:string, xs:string)?'),
};

/** A parameter's value from a parameters map, converted to its type; XPTY0004 when it cannot be. */
function mapParameter(options: XdmMap, name: string, kind: ParameterKind): ParameterValue {
  const value = optionValue(options, name, MAP_TYPES[kind]);
  if (value === undefined || value.length === 0) return undefined;
  const first = value[0] as XdmItem;
  switch (kind) {
    case 'boolean':
    case 'standalone': {
      return isTrue(value);
    }
    case 'names': {
      return value.map((item) => expandedName((item as XdmAtomicValue).value as QName));
    }
    case 'method': {
      return methodOf(name, first);
    }
    case 'character-map': {
      return characterMapOf(first as XdmMap);
    }
    default: {
      return String((first as XdmAtomicValue).value);
    }
  }
}

/** The parameters a parameters map sets, by name; other keys are left alone. */
function fromMap(options: XdmMap): Map<string, ParameterValue> {
  const values = new Map<string, ParameterValue>();
  for (const [name, kind] of Object.entries(PARAMETERS)) values.set(name, mapParameter(options, name, kind));
  return values;
}

/** A yes or no in a parameters element, as `yes`, `true` or `1`, or `no`, `false` or `0`, with whitespace around; SEPM0017 for another. */
function yesOrNo(name: string, value: string): boolean {
  const text = trimWhitespace(value);
  if (text === 'yes' || text === 'true' || text === '1') return true;
  if (text === 'no' || text === 'false' || text === '0') return false;
  return invalidElement(`The serialization parameter ${name} must be yes or no, not "${value}"`);
}

/** A name in a parameters element, an EQName or a lexical QName its prefixes resolve by the element's namespaces; unprefixed, in no namespace. */
function nameIn(element: XdmNode, text: string): string {
  const name = splitEQName(text);
  if (name === undefined) return invalidElement(`"${text}" is not a QName`);
  const { uri, prefix, localName } = name;
  if (uri !== undefined) return expandedName({ namespaceURI: uri, localName });
  if (prefix === '') return expandedName({ namespaceURI: '', localName });
  const namespaceURI = namespaceForPrefix(element.tree, element.index, prefix);
  if (namespaceURI === undefined) return invalidElement(`The prefix ${prefix} is not declared`);
  return expandedName({ namespaceURI, localName });
}

/** A method in a parameters element: one Serialization 3.1 defines, or SEPM0016 for one in another namespace; SEPM0017 otherwise. */
function methodIn(element: XdmNode, name: string, value: string): OutputMethod {
  const text = trimWhitespace(value);
  if ((OUTPUT_METHODS as readonly string[]).includes(text)) return text as OutputMethod;
  if (text.includes(':') || text.startsWith('Q{')) return invalidValue(name, nameIn(element, text));
  return invalidElement(`The serialization parameter ${name} cannot be "${value}"`);
}

/** The attributes of an element in no namespace, the only ones a parameters element gives meaning to. */
function plainAttributes(element: XdmNode): XdmNode[] {
  return element.attributes().filter((attribute) => attribute.namespaceURI === '');
}

/** A character map from a `use-character-maps` element: its `character-map` children, each one character to a string; it has no attributes. */
function characterMapIn(element: XdmNode): ReadonlyMap<string, string> {
  if (plainAttributes(element).length > 0) invalidElement('A use-character-maps element has no attributes');
  const mapping = new Map<string, string>();
  for (const child of element.children()) {
    if (child.kind !== NodeKind.ELEMENT) continue;
    if (child.namespaceURI !== OUTPUT_NAMESPACE || child.localName !== 'character-map')
      invalidElement(`${(child.nodeName as QName).toString()} is not a character-map element`);
    const names = plainAttributes(child).map((attribute) => attribute.localName);
    if (names.some((name) => name !== 'character' && name !== 'map-string'))
      invalidElement('A character-map element has only character and map-string attributes');
    const character = child.attribute('character');
    const replacement = child.attribute('map-string');
    if (character === undefined || replacement === undefined || characterCount(character) !== 1)
      invalidElement('A character-map element maps one character to a map-string');
    if (mapping.has(character))
      dynamicError(XPathErrorCode.DUPLICATE_CHARACTER_MAPPING, `The character ${character} is mapped more than once`);
    mapping.set(character, replacement);
  }
  return mapping;
}

/** A parameter's value from its element in a parameters element. */
function elementParameter(child: XdmNode, name: string, kind: ParameterKind): ParameterValue {
  if (kind === 'character-map') return characterMapIn(child);
  const attributes = plainAttributes(child);
  const value = child.attribute('value');
  if (value === undefined || attributes.length !== 1)
    return invalidElement(`The serialization parameter ${name} has one attribute, value`);
  switch (kind) {
    case 'boolean': {
      return yesOrNo(name, value);
    }
    case 'standalone': {
      return trimWhitespace(value) === 'omit' ? undefined : yesOrNo(name, value);
    }
    case 'names': {
      return splitWhitespace(value).map((text) => nameIn(child, text));
    }
    case 'method': {
      return methodIn(child, name, value);
    }
    case 'decimal': {
      const text = trimWhitespace(value);
      return Decimal.parse(text) === undefined ? invalidElement(`${value} is not a decimal`) : text;
    }
    default: {
      return value;
    }
  }
}

/** The parameters a parameters element sets, by name; SEPM0017 for one it does not know, SEPM0019 for one set twice. */
function fromElement(element: XdmNode): Map<string, ParameterValue> {
  if (plainAttributes(element).length > 0)
    invalidElement('A serialization-parameters element has no attributes in no namespace');
  const values = new Map<string, ParameterValue>();
  const seen = new Set<string>();
  for (const child of element.children()) {
    if (child.kind !== NodeKind.ELEMENT) continue;
    const key = expandedName(child);
    if (seen.has(key))
      dynamicError(
        XPathErrorCode.DUPLICATE_SERIALIZATION_PARAMETER,
        `${(child.nodeName as QName).toString()} is given twice`
      );
    seen.add(key);
    // Parameters in other namespaces are for other serializers, and are left alone.
    if (child.namespaceURI !== OUTPUT_NAMESPACE && child.namespaceURI !== '') continue;
    const kind = child.namespaceURI === OUTPUT_NAMESPACE ? PARAMETERS[child.localName] : undefined;
    if (kind === undefined) invalidElement(`${(child.nodeName as QName).toString()} is not a serialization parameter`);
    values.set(child.localName, elementParameter(child, child.localName, kind));
  }
  return values;
}

/** Whether an item is a serialization parameters element. */
function isParametersElement(item: XdmItem): item is XdmNode {
  return (
    isNode(item) &&
    item.kind === NodeKind.ELEMENT &&
    item.namespaceURI === OUTPUT_NAMESPACE &&
    item.localName === 'serialization-parameters'
  );
}

/** The normalization forms `normalization-form` may name, as `String.prototype.normalize` takes them. */
const NORMALIZATION_FORMS: ReadonlySet<string> = new Set<NormalizationForm>(['NFC', 'NFD', 'NFKC', 'NFKD']);

/** A `normalization-form` value as a form to normalize to; SESU0011 for one that is not supported. */
function normalizationFormOf(value: string | undefined): SerializationParameters['normalizationForm'] {
  const form = value === undefined ? 'none' : trimWhitespace(value);
  if (form === 'none') return undefined;
  if (NORMALIZATION_FORMS.has(form)) return form as NormalizationForm;
  return dynamicError(
    XPathErrorCode.UNSUPPORTED_OUTPUT_NORMALIZATION,
    `The normalization form ${form} is not supported`
  );
}

/** Every parameter, those not given taking `fn:serialize`'s defaults. */
function withDefaults(values: ReadonlyMap<string, ParameterValue>): SerializationParameters {
  const get = <Value extends ParameterValue>(name: string): Value | undefined => values.get(name) as Value | undefined;
  return {
    method: get<OutputMethod>('method') ?? 'xml',
    allowDuplicateNames: get<boolean>('allow-duplicate-names') ?? false,
    cdataSectionElements: get<readonly string[]>('cdata-section-elements') ?? [],
    doctypePublic: get<string>('doctype-public'),
    doctypeSystem: get<string>('doctype-system'),
    encoding: get<string>('encoding') ?? 'UTF-8',
    escapeURIAttributes: get<boolean>('escape-uri-attributes') ?? true,
    htmlVersion: Number(get<string>('html-version') ?? HTML5_VERSION),
    includeContentType: get<boolean>('include-content-type') ?? true,
    indent: get<boolean>('indent') ?? false,
    itemSeparator: get<string>('item-separator'),
    jsonNodeOutputMethod: get<OutputMethod>('json-node-output-method') ?? 'xml',
    mediaType: get<string>('media-type'),
    normalizationForm: normalizationFormOf(get<string>('normalization-form')),
    omitXMLDeclaration: get<boolean>('omit-xml-declaration') ?? true,
    standalone: get<boolean>('standalone'),
    suppressIndentation: get<readonly string[]>('suppress-indentation') ?? [],
    undeclarePrefixes: get<boolean>('undeclare-prefixes') ?? false,
    characterMap: get<ReadonlyMap<string, string>>('use-character-maps') ?? new Map(),
    version: get<string>('version') ?? '1.0',
  };
}

/**
 * The serialization parameters `fn:serialize` is given: none, a parameters map, or an
 * `output:serialization-parameters` element; XPTY0004 for anything else.
 */
export function serializationParameters(value: XdmValue | undefined): SerializationParameters {
  const item = value?.[0];
  if (item === undefined) return withDefaults(new Map());
  if (isMap(item)) return withDefaults(fromMap(item));
  if (isParametersElement(item)) return withDefaults(fromElement(item));
  return dynamicError(
    XPathErrorCode.TYPE_MISMATCH,
    'The serialization parameters must be a map or an output:serialization-parameters element'
  );
}
