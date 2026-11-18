import type { SAXHandler } from '@exemplarjs/sax';
import { EventType, type XMLEvent } from '@exemplarjs/xml';
import { byCodeUnit } from '@exemplarjs/xml/internal';

/** Adds text to an outline, merged with text just before it. */
function addText(outline: string[], text: string): void {
  if (outline.at(-1)?.startsWith('"') === true) outline.push(`${(outline.pop() as string).slice(0, -1)}${text}"`);
  else outline.push(`"${text}"`);
}

/** An outline of the document an event reader gives. */
export function outlineOfEvents(events: Iterable<XMLEvent>): string[] {
  const out: string[] = [];
  for (const event of events) {
    if (event.type === EventType.START_ELEMENT) {
      const attributes = event.attributes
        .map((a) => `${a.namespaceURI}|${a.localName}=${a.value}`)
        .toSorted(byCodeUnit);
      out.push(`<${event.name.namespaceURI}|${event.name.localName} ${attributes.join(' ')}>`);
    }
    if (event.type === EventType.END_ELEMENT) out.push(`</${event.name.localName}>`);
    if (event.type === EventType.CHARACTERS) addText(out, event.text);
    if (event.type === EventType.COMMENT) out.push(`<!--${event.text}-->`);
    if (event.type === EventType.PROCESSING_INSTRUCTION) out.push(`<?${event.target} ${event.data}?>`);
  }
  return out;
}

/** A SAX handler that writes the same outline. */
export function outlineHandler(out: string[]): SAXHandler {
  return {
    startElement: (uri, local, _q, attributes) => {
      const list: string[] = [];
      for (let i = 0; i < attributes.length; i++) {
        if (attributes.uri(i) !== 'http://www.w3.org/2000/xmlns/')
          list.push(`${attributes.uri(i)}|${attributes.localName(i)}=${attributes.value(i)}`);
      }
      out.push(`<${uri}|${local} ${list.toSorted(byCodeUnit).join(' ')}>`);
    },
    endElement: (_uri, local) => out.push(`</${local}>`),
    characters: (text) => addText(out, text),
    comment: (text) => out.push(`<!--${text}-->`),
    processingInstruction: (target, data) => out.push(`<?${target} ${data}?>`),
  };
}
