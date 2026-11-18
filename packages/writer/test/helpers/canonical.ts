import { canonicalOf } from '@exemplarjs/test-support';
import { EventType, type InputOptions, type Source, XMLInputFactory } from '@exemplarjs/xml';
import { byCodeUnit } from '@exemplarjs/xml/internal';

/** Returns a document's canonical form, or throws the XMLError it raises. */
export function canonical(source: Source, options: InputOptions = {}): string {
  return canonicalOf(new XMLInputFactory(options).createStreamReader(source));
}

/** An expanded name as `{uri}local`, or the local name alone in no namespace. */
function expanded(uri: string, localName: string): string {
  return uri === '' ? localName : `{${uri}}${localName}`;
}

/** A document's element and attribute names as namespaces expand them: `{uri}local`, `@{uri}local=value` and `/` ends. */
export function names(source: Source, options: InputOptions = {}): string[] {
  const reader = new XMLInputFactory(options).createStreamReader(source);
  const out: string[] = [];
  for (let event = reader.next(); event !== EventType.END_DOCUMENT; event = reader.next()) {
    if (event === EventType.START_ELEMENT) {
      out.push(expanded(reader.namespaceURI(), reader.localName()));
      const attributes: string[] = [];
      for (let i = 0; i < reader.attributeCount(); i++) {
        attributes.push(
          `@${expanded(reader.attributeNamespace(i), reader.attributeLocalName(i))}=${reader.attributeValue(i)}`
        );
      }
      out.push(...attributes.toSorted(byCodeUnit));
    } else if (event === EventType.END_ELEMENT) {
      out.push(`/${expanded(reader.namespaceURI(), reader.localName())}`);
    }
  }
  return out;
}
