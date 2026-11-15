import * as events from '@exemplarjs/xml';
import {
  type AsyncStreamReader,
  type Source,
  type StreamReader as PublicStreamReader,
  type XMLEvent,
  XMLInputFactory,
} from '@exemplarjs/xml';
import type { StreamReaderDelegate } from '@exemplarjs/xml/filters';
import {
  CREATE_READER,
  cursorOf,
  EventDispatcher,
  isReader,
  READER_OPTIONS,
  ReaderInput,
  type StreamReader,
} from '@exemplarjs/xml/internal';
import { Document, DOMImplementation, type MissingAttribute } from './nodes/index.ts';
import { DOMBuildingHandler } from './sax-handler.ts';
import { type ContentOptions, TreeBuilder } from './tree-builder.ts';

/** The cursor options a tree needs: xmlns attributes, and expansions to fill entity references; it joins CDATA itself. */
const READER_OVERRIDES = {
  namespacePrefixes: true,
  replaceEntityReferences: true,
  coalescing: false,
  reportEntityBoundaries: false,
};

// Module-level constants, so V8 can inline them; an imported binding is read again on every use.
const EventType = events.EventType;

/** What a DocumentBuilder adds to its factory's options, named as JAXP's `DocumentBuilderFactory` names them. */
export interface BuilderOptions {
  /** Leave comments out of the tree. */
  readonly ignoringComments?: boolean;
  /** Leave out whitespace in elements the DTD gives element content. */
  readonly ignoringElementContentWhitespace?: boolean;
  /**
   * What `getAttribute` gives for an attribute an element lacks: `'null'`, as browsers do, by
   * default, or `'empty'` for the empty string, as DOM Level 3 and Java do.
   */
  readonly missingAttribute?: MissingAttribute;
}

/**
 * Builds DOM trees with a factory's options, as JAXP's `DocumentBuilder` does.
 *
 * ```ts
 * const builder = new DocumentBuilder(new XMLInputFactory({ namespaceAware: true }));
 * const document = builder.parse('<list><item>one</item></list>');
 * document.documentElement?.firstChild?.textContent; // 'one'
 * ```
 *
 * It reads the document with the factory's cursor and adds a node for each event; the factory's
 * options decide what the tree holds, such as entity references or their expansions.
 *
 * It also builds from a reader, which can be filtered or a delegate that changes what it reports,
 * from where the reader stands: at the start of a document, the whole document; at a start tag,
 * that element as a document of its own, leaving the reader at its end tag. The reader's options
 * then decide what the tree holds.
 */
export class DocumentBuilder {
  readonly factory: XMLInputFactory;
  readonly options: BuilderOptions;
  readonly #implementation: DOMImplementation;
  /** The builder's own options, resolved. */
  readonly #ignoring: Omit<ContentOptions, 'coalescing'>;

  constructor(factory: XMLInputFactory = new XMLInputFactory(), options: BuilderOptions = {}) {
    this.factory = factory;
    this.options = options;
    this.#implementation = new DOMImplementation({ missingAttribute: options.missingAttribute ?? 'null' });
    this.#ignoring = {
      ignoringComments: options.ignoringComments ?? false,
      ignoringElementContentWhitespace: options.ignoringElementContentWhitespace ?? false,
    };
  }

  get domImplementation(): DOMImplementation {
    return this.#implementation;
  }

  /**
   * Builds a tree from event objects, such as those an event reader gives or a generator makes from
   * them. Events that start with an element's, with no START_DOCUMENT, make a document of that
   * element. They are checked as SAX events are.
   */
  build(events: Iterable<XMLEvent>): Document {
    const handler = this.createSAXHandler();
    new EventDispatcher(handler).dispatchAll(events);
    return handler.document;
  }

  /** Builds a tree from event objects as they arrive, such as an asynchronous event reader's. */
  async buildAsync(events: AsyncIterable<XMLEvent> | Iterable<XMLEvent>): Promise<Document> {
    const handler = this.createSAXHandler();
    await new EventDispatcher(handler).dispatchAllAsync(events);
    return handler.document;
  }

  /**
   * A SAX handler that builds a tree from the events it is given, such as those a chain of SAX
   * filters passes on; its `document` is the tree once `endDocument` is called.
   */
  createSAXHandler(): DOMBuildingHandler {
    return new DOMBuildingHandler(this.#implementation, {
      ...this.#ignoring,
      coalescing: this.factory.options.coalescing,
    });
  }

  /** An empty document. */
  newDocument(): Document {
    return new Document(this.#implementation);
  }

  /** Parses a document into a tree, or builds one from a reader from where it stands. */
  parse(source: Source | PublicStreamReader | StreamReaderDelegate): Document {
    return isReader(source) ? this.#parseReader(source as StreamReader) : this.#parseSource(source);
  }

  /** Parses a document from a source with the factory's cursor. */
  #parseSource(source: Source): Document {
    const tree = this.#treeBuilder(source, 'sync');
    let type = tree.reader.eventType();
    while (!tree.add(type)) type = tree.reader.next();
    return tree.document;
  }

  /** Parses a stream or any other source into a tree, or builds one from a reader, awaiting input as it arrives. */
  parseAsync(source: Source | PublicStreamReader | AsyncStreamReader | StreamReaderDelegate): Promise<Document> {
    return isReader(source) ? this.#parseReaderAsync(source as StreamReader) : this.#parseSourceAsync(source);
  }

  /** Parses a document from a source with the factory's cursor, awaiting input as it arrives. */
  async #parseSourceAsync(source: Source): Promise<Document> {
    const tree = this.#treeBuilder(source, 'async');
    for (let type = tree.reader.eventType(); ; type = tree.reader.next()) {
      if (type === EventType.NEED_INPUT) await tree.reader.fill();
      else if (tree.add(type)) return tree.document;
    }
  }

  /** Builds a tree from a reader, from where it stands. */
  #parseReader(reader: StreamReader): Document {
    const input = new ReaderInput(reader, { consumer: 'DocumentBuilder.parse', mode: 'sync' });
    const tree = this.#readerTreeBuilder(reader);
    const uri = reader.location().systemId ?? null;
    input.read(tree);
    return readerDocument(tree.document, input, uri);
  }

  /** Builds a tree from a reader, from where it stands, awaiting input as it arrives. */
  async #parseReaderAsync(reader: StreamReader): Promise<Document> {
    const input = new ReaderInput(reader, { consumer: 'DocumentBuilder.parseAsync', mode: 'async' });
    const tree = this.#readerTreeBuilder(reader);
    const uri = reader.location().systemId ?? null;
    await input.readAsync(tree);
    return readerDocument(tree.document, input, uri);
  }

  /** A tree builder over a new document for a reader, with the reader's options. */
  #readerTreeBuilder(reader: StreamReader): TreeBuilder {
    const options = cursorOf(reader)[READER_OPTIONS];
    return new TreeBuilder(reader, new Document(this.#implementation), {
      ...this.#ignoring,
      namespaceAware: options.namespaceAware,
      coalescing: options.coalescing,
      entityReferences: false,
      declaresNamespaces: options.namespaceAware && !options.namespacePrefixes,
    });
  }

  /** A tree builder over a new document and a cursor for the source. */
  #treeBuilder(source: Source, mode: 'sync' | 'async'): TreeBuilder {
    const reader = this.factory[CREATE_READER](source, READER_OVERRIDES, mode === 'async');
    const document = new Document(this.#implementation);
    if (typeof source === 'object' && 'systemId' in source && source.systemId !== undefined) {
      document._documentURI = source.systemId;
    }
    const options = this.factory.options;
    return new TreeBuilder(reader, document, {
      ...this.#ignoring,
      namespaceAware: options.namespaceAware,
      coalescing: options.coalescing,
      entityReferences: !options.replaceEntityReferences,
      declaresNamespaces: false,
    });
  }
}

/** A document read from a reader: a whole document takes the reader's URI, an element read on its own none. */
function readerDocument(document: Document, input: ReaderInput, uri: string | null): Document {
  if (!input.isElement) document._documentURI = uri;
  return document;
}
