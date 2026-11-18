import { canonicalTag, escapeCanonical } from '@exemplarjs/test-support';
import { EventType, type StreamReader } from '@exemplarjs/xml';
import { byCodeUnit } from '@exemplarjs/xml/internal';
import type { Attributes, SAXHandler } from '@/index';

/** A SAX handler that writes the first canonical form, and what it has written; PIs in the DTD are left out. */
export function canonicalHandler(): { handler: SAXHandler; written: () => string } {
  let out = '';
  let inDtd = false;
  const handler: SAXHandler = {
    startDTD: () => {
      inDtd = true;
    },
    endDTD: () => {
      inDtd = false;
    },
    startElement: (_uri: string, _localName: string, qName: string, attributes: Attributes) => {
      const pairs = Array.from(
        { length: attributes.length },
        (_, i) => [attributes.qName(i), attributes.value(i)] as const
      );
      out += canonicalTag(qName, pairs);
    },
    endElement: (_uri, _localName, qName) => {
      out += `</${qName}>`;
    },
    characters: (text) => {
      out += escapeCanonical(text);
    },
    processingInstruction: (target, data) => {
      if (!inDtd) out += `<?${target} ${data}?>`;
    },
  };
  return { handler, written: () => out };
}

/** An expanded name as `{uri}local`, or the local name alone in no namespace. */
function expanded(uri: string, localName: string): string {
  return uri === '' ? localName : `{${uri}}${localName}`;
}

/** The cursor's names in order: `+p=uri` and `-p` around elements, `{uri}local` starts, `@{uri}local=value` attributes, `/` ends. */
export function namesOf(reader: StreamReader): string[] {
  const out: string[] = [];
  for (let event = reader.next(); event !== EventType.END_DOCUMENT; event = reader.next()) {
    if (event === EventType.START_ELEMENT) {
      for (let i = 0; i < reader.namespaceCount(); i++)
        out.push(`+${reader.namespacePrefix(i)}=${reader.namespaceURI(i)}`);
      out.push(expanded(reader.namespaceURI(), reader.localName()));
      const attributes: string[] = [];
      for (let i = 0; i < reader.attributeCount(); i++) {
        const name = expanded(reader.attributeNamespace(i), reader.attributeLocalName(i));
        attributes.push(`@${name}=${reader.attributeValue(i)}`);
      }
      out.push(...attributes.toSorted(byCodeUnit));
    } else if (event === EventType.END_ELEMENT) {
      out.push(`/${expanded(reader.namespaceURI(), reader.localName())}`);
      for (let i = 0; i < reader.namespaceCount(); i++) out.push(`-${reader.namespacePrefix(i)}`);
    }
  }
  return out;
}

/** A SAX handler that records names as `namesOf` writes them. */
export function namesHandler(): { handler: SAXHandler; names: string[] } {
  const names: string[] = [];
  const handler: SAXHandler = {
    startPrefixMapping: (prefix, uri) => names.push(`+${prefix}=${uri}`),
    startElement: (uri, localName, _qName, attributes) => {
      names.push(expanded(uri, localName));
      const list = Array.from(
        { length: attributes.length },
        (_, i) => `@${expanded(attributes.uri(i), attributes.localName(i))}=${attributes.value(i)}`
      );
      names.push(...list.toSorted(byCodeUnit));
    },
    endElement: (uri, localName) => names.push(`/${expanded(uri, localName)}`),
    endPrefixMapping: (prefix) => names.push(`-${prefix}`),
  };
  return { handler, names };
}
