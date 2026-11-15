import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { XdmDocumentBuilder } from '@exemplarjs/xdm';
import { EventType, XMLInputFactory } from '@exemplarjs/xml';
import { createFilteredReader, type StreamFilter } from '@exemplarjs/xml/filters';
import { XPathCompiler } from '@exemplarjs/xpath';

/** A filter that drops `internal` elements with everything inside them. */
function buildInternalFilter(): StreamFilter {
  // How many elements are open in the internal element being dropped, itself included; 0 outside one.
  let dropping = 0;
  return (reader) => {
    const type = reader.eventType();
    if (type === EventType.START_ELEMENT && (dropping > 0 || reader.localName() === 'internal')) {
      dropping++;
      return false;
    }
    if (type === EventType.END_ELEMENT && dropping > 0) {
      dropping--;
      return false;
    }
    return dropping === 0;
  };
}

/** A filter that drops comments, and text that is only whitespace: the source's layout. */
function buildCommentAndWhitespaceFilter(): StreamFilter {
  return (reader) => reader.eventType() !== EventType.COMMENT && !reader.isWhitespace();
}

/** Builds a tree of a catalog without its comment, internal notes and layout, and writes the tree out indented. */
export function run(path: string): string {
  const factory = new XMLInputFactory();
  const source = factory.createStreamReader({ systemId: pathToFileURL(path).href, bytes: readFileSync(path) });
  // The filters run in order: each sees the events the one before it kept.
  const reader = createFilteredReader(source, buildInternalFilter(), buildCommentAndWhitespaceFilter());
  // The builder reads the filtered reader: what the filters drop never reaches the tree.
  const catalog = new XdmDocumentBuilder().parse(reader);
  // serialize leaves the XML declaration out, and adds no layout of its own, unless asked.
  const serialize = "serialize(/, map { 'omit-xml-declaration': false(), 'indent': true() })";
  return new XPathCompiler().compile(serialize).evaluateString(catalog);
}

// `node example.ts` prints the result for the source file beside it.
if (import.meta.main) {
  const source = fileURLToPath(new URL('source.xml', import.meta.url));
  console.log(run(source));
}
