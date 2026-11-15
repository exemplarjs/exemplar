import {
  EMPTY_SEQUENCE,
  inScopeNamespaces,
  namespaceForPrefix,
  XdmAtomicValue,
  type XdmNode,
  type XdmValue,
  XS,
} from '@exemplarjs/xdm';
import { QName } from '@exemplarjs/xml';
import { lexicalQNameParts, trimWhitespace } from '@exemplarjs/xml/internal';
import { dynamicError, XPathErrorCode } from '@/api/xpath-exception';
import type { FunctionDefinition } from '@/functions/function-library';
import { defineFunction } from '@/functions/signatures';
import { anyURIResult, propagatingEmpty, onlyItem, optionalString, stringArgument, stringResult } from './values.ts';

/** A QName as a value. */
function qNameResult(name: QName): XdmValue {
  return [new XdmAtomicValue(XS.QName, name)];
}

/** Splits a lexical QName into prefix and local name; FOCA0002 when it is not one. */
function splitLexical(text: string): [string, string] {
  return (
    lexicalQNameParts(text) ?? dynamicError(XPathErrorCode.INVALID_LEXICAL_QNAME, `"${text}" is not a lexical QName`)
  );
}

/** The URI a prefix is bound to at an element, `''` for no default namespace, or undefined for an unbound prefix. */
function uriForPrefix(element: XdmNode, prefix: string): string | undefined {
  return namespaceForPrefix(element.tree, element.index, prefix);
}

/** `fn:resolve-QName`: a lexical QName resolved by an element's in-scope namespaces; FONS0004 for an unbound prefix. */
function resolveQName(text: string, element: XdmNode): XdmValue {
  const [prefix, localName] = splitLexical(trimWhitespace(text));
  const namespaceURI = uriForPrefix(element, prefix);
  if (namespaceURI === undefined)
    return dynamicError(XPathErrorCode.NO_NAMESPACE_FOR_PREFIX, `The prefix "${prefix}" is not in scope`);
  return qNameResult(new QName(namespaceURI, localName, prefix));
}

/** A function of an optional QName. */
function qNameAccessor(name: string, returnType: string, operation: (name: QName) => XdmValue): FunctionDefinition {
  return defineFunction(
    `fn:${name}($arg as xs:QName?) as ${returnType}`,
    propagatingEmpty((value) => operation(value.value as QName))
  );
}

/** The functions on QNames (F&O §10.2) and on an element's namespaces (§14.6). */
export const QNAME_FUNCTIONS: readonly FunctionDefinition[] = [
  defineFunction('fn:QName($paramURI as xs:string?, $paramQName as xs:string) as xs:QName', ([uri, qName]) => {
    const namespaceURI = stringArgument(uri);
    const [prefix, localName] = splitLexical(stringArgument(qName));
    if (prefix !== '' && namespaceURI === '')
      return dynamicError(XPathErrorCode.INVALID_LEXICAL_QNAME, 'A QName with a prefix must have a namespace');
    return qNameResult(new QName(namespaceURI, localName, prefix));
  }),
  defineFunction('fn:resolve-QName($qname as xs:string?, $element as element()) as xs:QName?', ([qName, element]) => {
    const text = optionalString(qName);
    return text === undefined ? EMPTY_SEQUENCE : resolveQName(text, onlyItem<XdmNode>(element));
  }),
  qNameAccessor('prefix-from-QName', 'xs:NCName?', (name) =>
    name.prefix === '' ? EMPTY_SEQUENCE : [XdmAtomicValue.string(name.prefix, XS.NCName)]
  ),
  qNameAccessor('local-name-from-QName', 'xs:NCName?', (name) => [XdmAtomicValue.string(name.localName, XS.NCName)]),
  qNameAccessor('namespace-uri-from-QName', 'xs:anyURI?', (name) => anyURIResult(name.namespaceURI)),
  defineFunction(
    'fn:namespace-uri-for-prefix($prefix as xs:string?, $element as element()) as xs:anyURI?',
    ([prefix, element]) => {
      const uri = uriForPrefix(onlyItem<XdmNode>(element), stringArgument(prefix));
      if (uri === undefined || uri === '') return EMPTY_SEQUENCE;
      return anyURIResult(uri);
    }
  ),
  defineFunction('fn:in-scope-prefixes($element as element()) as xs:string*', ([element]) => {
    const node = onlyItem<XdmNode>(element);
    return inScopeNamespaces(node.tree, node.index).flatMap((binding) => stringResult(binding.prefix));
  }),
];
