import {
  derivesFrom,
  isArray,
  isAtomicValue,
  isMap,
  isNode,
  isNumericType,
  type XdmAtomicValue,
  type XdmItem,
  type XdmNode,
  type XdmValue,
  XS,
} from '@exemplarjs/xdm';
import { dynamicError, XPathErrorCode } from '@/api/xpath-exception';
import { stringValueOf } from '@/functions/core/strings';
import { escapeCharacter, joinedJSON, type Layout, quotedJSON } from '@/functions/json/json-strings';
import type { SerializationParameters } from './serialization-parameters.ts';
import { normalizedText } from './xml-output.ts';

/** How a node is written inside JSON: serialized by the method `json-node-output-method` names. */
export type NodeWriter = (node: XdmNode) => string;

/** What writing one JSON value needs: the parameters, how nodes are written, and the layout at this depth. */
interface JsonContext {
  readonly parameters: SerializationParameters;
  readonly writeNode: NodeWriter;
  readonly layout: Layout;
}

/** The same context one level deeper. */
function deeper(context: JsonContext): JsonContext {
  return { ...context, layout: { indent: context.layout.indent, depth: context.layout.depth + 1 } };
}

/** Text as a JSON string, normalized as the parameters ask and with characters the encoding lacks escaped. */
function stringOf(text: string, parameters: SerializationParameters): string {
  const quoted = quotedJSON(normalizedText(text, parameters));
  if (/^utf-?(8|16)$/i.test(parameters.encoding)) return quoted;
  // Outside UTF-8 and UTF-16, anything beyond ASCII is written as escapes, a surrogate pair as two.
  return quoted.replaceAll(/[\u0080-\uFFFF]/g, escapeCharacter);
}

/** An atomic value as JSON: a number, a boolean, or a string of its string value; SERE0020 for NaN and the infinities. */
function atomicOf(value: XdmAtomicValue, parameters: SerializationParameters): string {
  const type = value.type;
  if (derivesFrom(type, XS.boolean)) return value.value === true ? 'true' : 'false';
  const text = stringValueOf(value);
  if (!isNumericType(type)) return stringOf(text, parameters);
  if (!/^[-+0-9.Ee]+$/.test(text))
    return dynamicError(XPathErrorCode.NUMBER_NOT_IN_JSON, `JSON has no number for ${text}`);
  return text;
}

/** A map as a JSON object; SERE0022 for two keys with the same string value, unless the parameters allow it. */
function objectOf(map: Iterable<readonly [XdmAtomicValue, XdmValue]>, context: JsonContext): string {
  const names = new Set<string>();
  const members: string[] = [];
  const inner = deeper(context);
  const separator = context.layout.indent ? ': ' : ':';
  for (const [key, value] of map) {
    const name = stringValueOf(key);
    if (names.has(name) && !context.parameters.allowDuplicateNames)
      dynamicError(XPathErrorCode.DUPLICATE_JSON_NAME, `The name "${name}" is written twice`);
    names.add(name);
    members.push(`${stringOf(name, context.parameters)}${separator}${valueOf(value, inner)}`);
  }
  return joinedJSON(members, '{', '}', context.layout);
}

/** An item as JSON; SERE0021 for a function item, which JSON has no form for. */
function itemOf(item: XdmItem, context: JsonContext): string {
  if (isAtomicValue(item)) return atomicOf(item, context.parameters);
  if (isNode(item)) return stringOf(context.writeNode(item), context.parameters);
  if (isMap(item)) return objectOf(item.entries(), context);
  if (isArray(item)) {
    const inner = deeper(context);
    return joinedJSON(
      item.members.map((member) => valueOf(member, inner)),
      '[',
      ']',
      context.layout
    );
  }
  return dynamicError(XPathErrorCode.ITEM_NOT_IN_JSON, 'JSON has no form for a function item');
}

/** A value as JSON: null for none, the item for one; SERE0023 for more than one. */
function valueOf(value: XdmValue, context: JsonContext): string {
  if (value.length > 1)
    return dynamicError(XPathErrorCode.SEQUENCE_NOT_IN_JSON, 'The JSON method writes one item, not a sequence of more');
  return value.length === 0 ? 'null' : itemOf(value[0] as XdmItem, context);
}

/** A value written by the JSON method, its nodes written as `writeNode` writes them. */
export function jsonOutput(value: XdmValue, parameters: SerializationParameters, writeNode: NodeWriter): string {
  return valueOf(value, { parameters, writeNode, layout: { indent: parameters.indent, depth: 0 } });
}
