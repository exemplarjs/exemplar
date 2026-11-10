import {
  derivesFrom,
  isArray,
  isAtomicValue,
  isMap,
  isNode,
  NodeKind,
  type XdmAtomicValue,
  type XdmFunction,
  type XdmItem,
  type XdmNode,
  type XdmValue,
  XS,
} from '@exemplarjs/xdm';
import { isStringLike, scientific } from '@exemplarjs/xdm/internal';
import { QName } from '@exemplarjs/xml';
import { declarationName } from '@exemplarjs/xml/internal';
import { stringValueOf } from '@/functions/core/strings';
import { expandedKey } from '@/static/static-context';
import type { NodeWriter } from './json-output.ts';
import type { SerializationParameters } from './serialization-parameters.ts';

/** What the adaptive method writes between items when the parameters name no separator. */
const DEFAULT_SEPARATOR = '\n';

/** Text between double quotes, each quote in it doubled, as an XPath string literal. */
function quoted(text: string): string {
  return `"${text.replaceAll('"', '""')}"`;
}

/** Text escaped for an attribute value between double quotes. */
function escapedAttributeValue(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
}

/** A double in exponential notation, as the adaptive method writes it: `1.0e0`, `-0.0e0`, `NaN`, `INF`. */
function adaptiveDouble(value: number): string {
  if (Number.isNaN(value)) return 'NaN';
  if (!Number.isFinite(value)) return value > 0 ? 'INF' : '-INF';
  // `toExponential` drops the sign of -0.
  const sign = Object.is(value, -0) ? '-' : '';
  return sign + scientific(value).replace('E', 'e');
}

/** An atomic value as the adaptive method writes it: strings quoted, numbers and booleans as XPath writes them, others as constructor calls. */
function adaptiveAtomic(value: XdmAtomicValue): string {
  const type = value.type;
  if (value.value instanceof QName) return expandedKey(value.value);
  if (derivesFrom(type, XS.boolean)) return value.value === true ? 'true()' : 'false()';
  if (derivesFrom(type, XS.double)) return adaptiveDouble(value.value as number);
  const text = stringValueOf(value);
  if (isStringLike(type)) return quoted(text);
  if (derivesFrom(type, XS.decimal)) return text;
  return `xs:${type.name.localName}(${quoted(text)})`;
}

/** A function item by its name, which the library always gives a prefix, and arity, or as anonymous. */
function adaptiveFunction(item: XdmFunction): string {
  const name = item.name;
  return name === undefined ? `(anonymous-function)#${item.arity}` : `${name.toString()}#${item.arity}`;
}

/** A node as the adaptive method writes it: an attribute or namespace as it is written in a tag, any other by the XML method. */
function adaptiveNode(node: XdmNode, writeNode: NodeWriter): string {
  if (node.kind === NodeKind.ATTRIBUTE)
    return `${(node.nodeName as QName).toString()}="${escapedAttributeValue(node.stringValue)}"`;
  if (node.kind === NodeKind.NAMESPACE)
    return `${declarationName(node.localName)}="${escapedAttributeValue(node.stringValue)}"`;
  return writeNode(node);
}

/** A value inside a map or array: its one item, or its items in parentheses. */
function adaptiveMember(value: XdmValue, writeNode: NodeWriter): string {
  if (value.length === 1) return adaptiveItem(value[0] as XdmItem, writeNode);
  return `(${value.map((item) => adaptiveItem(item, writeNode)).join(',')})`;
}

/** An item as the adaptive method writes it. */
function adaptiveItem(item: XdmItem, writeNode: NodeWriter): string {
  if (isAtomicValue(item)) return adaptiveAtomic(item);
  if (isNode(item)) return adaptiveNode(item, writeNode);
  if (isMap(item)) {
    const entries = [...item.entries()].map(
      ([key, value]) => `${adaptiveAtomic(key)}:${adaptiveMember(value, writeNode)}`
    );
    return `map{${entries.join(',')}}`;
  }
  if (isArray(item)) return `[${item.members.map((member) => adaptiveMember(member, writeNode)).join(',')}]`;
  return adaptiveFunction(item);
}

/** A value written by the adaptive method, its items separated by the item separator or a line feed. */
export function adaptiveOutput(value: XdmValue, parameters: SerializationParameters, writeNode: NodeWriter): string {
  const separator = parameters.itemSeparator ?? DEFAULT_SEPARATOR;
  return value.map((item) => adaptiveItem(item, writeNode)).join(separator);
}
