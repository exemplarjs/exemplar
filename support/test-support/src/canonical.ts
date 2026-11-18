import { type AsyncStreamReader, EventType, type StreamReader, type XMLEvent } from '@exemplarjs/xml';

const ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  '\t': '&#9;',
  '\n': '&#10;',
  '\r': '&#13;',
};

/** Escapes character data and attribute values as the suite's canonical form does. */
export function escapeCanonical(text: string): string {
  return text.replaceAll(/[&<>"\t\n\r]/g, (c) => ESCAPES[c] ?? c);
}

/** Writes a start tag from a name and its attributes, sorted by name. */
export function canonicalTag(name: string, attributes: readonly (readonly [string, string])[]): string {
  const written = attributes
    .toSorted(([a], [b]) => (a < b ? -1 : Number(a > b)))
    .map(([attribute, value]) => ` ${attribute}="${escapeCanonical(value)}"`);
  return `<${name}${written.join('')}>`;
}

/** Writes the start tag a reader is at, with its attributes sorted by name. */
function startTag(reader: StreamReader | AsyncStreamReader): string {
  const attributes = Array.from(
    { length: reader.attributeCount() },
    (_, i) => [reader.attributeName(i), reader.attributeValue(i)] as const
  );
  return canonicalTag(reader.name(), attributes);
}

/** Writes one event in the first canonical form; comments, the DOCTYPE and skipped entities write nothing. */
export function write(reader: StreamReader | AsyncStreamReader, event: EventType): string {
  switch (event) {
    case EventType.START_ELEMENT: {
      return startTag(reader);
    }
    case EventType.END_ELEMENT: {
      return `</${reader.name()}>`;
    }
    case EventType.CHARACTERS:
    case EventType.SPACE:
    case EventType.CDATA: {
      return escapeCanonical(reader.text());
    }
    case EventType.PROCESSING_INSTRUCTION: {
      return `<?${reader.piTarget()} ${reader.piData()}?>`;
    }
    default: {
      return '';
    }
  }
}

/** Reads a document to its end and returns it in the suite's first canonical form. */
export function canonicalOf(reader: StreamReader): string {
  let out = '';
  for (let event = reader.next(); event !== EventType.END_DOCUMENT; event = reader.next()) out += write(reader, event);
  return out;
}

/** Reads a document with an asynchronous reader, awaiting `fill()` whenever it needs input. */
export async function canonicalOfAsync(reader: AsyncStreamReader): Promise<string> {
  let out = '';
  for (let event = reader.next(); event !== EventType.END_DOCUMENT; event = reader.next()) {
    // eslint-disable-next-line no-await-in-loop -- input arrives in order, each chunk before the next
    if (event === EventType.NEED_INPUT) await reader.fill();
    else out += write(reader, event);
  }
  return out;
}

/** Writes one event object in the first canonical form. */
export function writeEvent(event: XMLEvent): string {
  switch (event.type) {
    case EventType.START_ELEMENT: {
      return canonicalTag(
        event.name.toString(),
        event.attributes.map((a) => [a.toString(), a.value] as const)
      );
    }
    case EventType.END_ELEMENT: {
      return `</${event.name.toString()}>`;
    }
    case EventType.CHARACTERS:
    case EventType.SPACE:
    case EventType.CDATA: {
      return escapeCanonical(event.text);
    }
    case EventType.PROCESSING_INSTRUCTION: {
      return `<?${event.target} ${event.data}?>`;
    }
    default: {
      return '';
    }
  }
}
