import * as events from '@exemplarjs/xml';
import {
  type AsyncStreamReader,
  InvalidArgumentError,
  type Source,
  type SourceObject,
  type StreamReader as PublicStreamReader,
  type XMLEvent,
  XMLInputFactory,
} from '@exemplarjs/xml';
import type { StreamReaderDelegate } from '@exemplarjs/xml/filters';
import {
  CREATE_READER,
  ErrorFactory,
  EventDispatcher,
  isReader,
  ReaderInput,
  sourceObjectOf,
  type StreamReader,
} from '@exemplarjs/xml/internal';
import { NameTable } from '@/names/name-table';
import { XdmNode } from '@/node/xdm-node';
import { ROOT_NODE, type Tree } from '@/tree/tree';
import { TreeBuilder } from '@/tree/tree-builder';
import { CursorLoader } from './cursor-loader.ts';
import { XdmBuildingHandler } from './sax-handler.ts';

// Module-level constants, so V8 can inline them; an imported binding is read again on every use.
const { START_ELEMENT, END_ELEMENT, NEED_INPUT } = events.EventType;

/** A few characters fewer than the markup and text a node usually takes, to size the tree's arrays from a string's length. */
const CHARACTERS_PER_NODE = 22;

/** The element a fragment is read inside, so that the reader takes its content as an element's. */
const FRAGMENT_WRAPPER = 'fragment';

/** How many names the trees a builder makes share one table for, before it starts a new one. */
const SHARED_NAMES = 65_536;

/** The reader options a reader given to the builder must have, as XDM's names and nodes need them. */
const READER_NEEDS = { namespaceAware: true, namespacePrefixes: false, replaceEntityReferences: true };

/** The reader options XDM needs, whatever the factory's: namespaces, and entities expanded; the loader joins text itself. */
const READER_OVERRIDES = {
  namespaceAware: true,
  namespacePrefixes: false,
  replaceEntityReferences: true,
  coalescing: false,
  reportPrologWhitespace: false,
  reportEntityBoundaries: false,
  copyStrings: false,
};

/**
 * Builds XDM trees with a factory's options, giving each document as an `XdmNode`.
 *
 * ```ts
 * const builder = new XdmDocumentBuilder();
 * const document = builder.parse('<list><item>one</item><item>two</item></list>');
 * document.stringValue; // 'onetwo'
 * ```
 *
 * The factory's options apply, such as DTD loading, XInclude and validation, except those XDM
 * fixes: documents are read with namespaces, and with entity references expanded.
 *
 * It also builds from a reader, which can be filtered or a delegate that changes what it reports,
 * from where the reader stands: at the start of a document, the whole document; at a start tag,
 * that element as a document of its own, leaving the reader at its end tag.
 *
 * ```ts
 * const noComments = (reader: StreamReader) => reader.eventType() !== EventType.COMMENT;
 * const document = builder.parse(createFilteredReader(factory.createStreamReader(source), noComments));
 * ```
 */
export class XdmDocumentBuilder {
  readonly factory: XMLInputFactory;
  /** The name table the next tree adds its names to. */
  #names = new NameTable();

  /** A builder that reads with a factory, which must be namespace-aware, as a tree's names are. */
  constructor(factory: XMLInputFactory = new XMLInputFactory()) {
    if (!factory.options.namespaceAware)
      throw ErrorFactory.create(InvalidArgumentError, 'XdmDocumentBuilder needs a factory with namespaceAware: true');
    this.factory = factory;
  }

  /** Parses a document into a tree, or builds one from a reader from where it stands; returns its document node. */
  parse(source: Source | PublicStreamReader | StreamReaderDelegate): XdmNode {
    return isReader(source) ? this.#parseReader(source as StreamReader) : this.#parseSource(source);
  }

  /** Parses a document from a source with the factory's cursor. */
  #parseSource(source: Source): XdmNode {
    const loader = this.#loader(source, 'sync');
    const reader = loader.reader;
    let type = reader.eventType();
    while (!loader.add(type)) type = reader.next();
    return documentNode(loader.finish());
  }

  /**
   * Builds a tree from event objects, such as those an event reader gives or a generator makes from
   * them; returns its document node. Events that start with an element's, with no START_DOCUMENT,
   * make a document of that element. They are checked as SAX events are.
   */
  build(events: Iterable<XMLEvent>): XdmNode {
    const handler = this.createSAXHandler();
    new EventDispatcher(handler).dispatchAll(events);
    return handler.document;
  }

  /** Builds a tree from event objects as they arrive, such as an asynchronous event reader's; returns its document node. */
  async buildAsync(events: AsyncIterable<XMLEvent> | Iterable<XMLEvent>): Promise<XdmNode> {
    const handler = this.createSAXHandler();
    await new EventDispatcher(handler).dispatchAllAsync(events);
    return handler.document;
  }

  /**
   * A SAX handler that builds a tree from the events it is given, such as those a chain of SAX
   * filters passes on; its `document` is the tree's document node once `endDocument` is called.
   */
  createSAXHandler(): XdmBuildingHandler {
    return new XdmBuildingHandler(() => this.#treeBuilder(undefined));
  }

  /**
   * Parses text as the content of an element into a tree, as an external parsed entity without its
   * text declaration: any mix of elements, text, comments and processing instructions; returns its
   * document node, whose base URI is the one given and which has no document URI.
   */
  parseFragment(text: string, baseURI?: string): XdmNode {
    const wrapped = `<${FRAGMENT_WRAPPER}>${text}</${FRAGMENT_WRAPPER}>`;
    const loader = this.#loader(baseURI === undefined ? wrapped : { text: wrapped, baseURI }, 'sync');
    const reader = loader.reader;
    let depth = 0;
    for (let type = reader.eventType(); ; type = reader.next()) {
      // The wrapper's own start and end add nothing: its content becomes the document's.
      if (type === START_ELEMENT && depth++ === 0) continue;
      if (type === END_ELEMENT && --depth === 0) continue;
      if (loader.add(type)) return documentNode(loader.finish());
    }
  }

  /** Parses a stream or any other source into a tree, or builds one from a reader, awaiting input as it arrives; returns its document node. */
  parseAsync(source: Source | PublicStreamReader | AsyncStreamReader | StreamReaderDelegate): Promise<XdmNode> {
    return isReader(source) ? this.#parseReaderAsync(source as StreamReader) : this.#parseSourceAsync(source);
  }

  /** Parses a document from a source with the factory's cursor, awaiting input as it arrives. */
  async #parseSourceAsync(source: Source): Promise<XdmNode> {
    const loader = this.#loader(source, 'async');
    const reader = loader.reader;
    for (let type = reader.eventType(); ; type = reader.next()) {
      if (type === NEED_INPUT) await reader.fill();
      else if (loader.add(type)) return documentNode(loader.finish());
    }
  }

  /** Builds a tree from a reader, from where it stands. */
  #parseReader(reader: StreamReader): XdmNode {
    const input = new ReaderInput(reader, { consumer: 'XdmDocumentBuilder.parse', mode: 'sync', needs: READER_NEEDS });
    const [tree, uri] = this.#readerTree(reader);
    input.read(new CursorLoader(reader, tree));
    return readerDocument(tree, input, uri);
  }

  /** Builds a tree from a reader, from where it stands, awaiting input as it arrives. */
  async #parseReaderAsync(reader: StreamReader): Promise<XdmNode> {
    const input = new ReaderInput(reader, {
      consumer: 'XdmDocumentBuilder.parseAsync',
      mode: 'async',
      needs: READER_NEEDS,
    });
    const [tree, uri] = this.#readerTree(reader);
    await input.readAsync(new CursorLoader(reader, tree));
    return readerDocument(tree, input, uri);
  }

  /** A new tree for a reader's input, started, and the URI the reader reads from. */
  #readerTree(reader: StreamReader): [TreeBuilder, string | null] {
    const tree = this.#treeBuilder(undefined);
    tree.startDocument(null);
    return [tree, reader.location().systemId ?? null];
  }

  /** A loader over a new tree and a cursor for the source. */
  #loader(source: Source, mode: 'sync' | 'async'): CursorLoader {
    const reader = this.factory[CREATE_READER](source, READER_OVERRIDES, mode === 'async');
    const builder = this.#treeBuilder(expectedNodes(source));
    builder.startDocument(sourceField(source, 'systemId'));
    const baseURI = sourceField(source, 'baseURI');
    if (baseURI !== null) builder.setBaseURI(ROOT_NODE, baseURI);
    return new CursorLoader(reader, builder);
  }

  /** A tree builder sized for the nodes expected, if known, sharing the builder's name table. */
  #treeBuilder(expected: number | undefined): TreeBuilder {
    // Trees share names, so that later documents find theirs already there, up to a bound.
    if (this.#names.size > SHARED_NAMES) this.#names = new NameTable();
    const names = this.#names;
    return new TreeBuilder(expected === undefined ? { names } : { names, expectedNodes: expected });
  }
}

/** The document node of a tree read from a reader: a whole document takes the reader's URI, an element only its base URI. */
function readerDocument(tree: TreeBuilder, input: ReaderInput, uri: string | null): XdmNode {
  if (input.isElement && uri !== null) tree.setBaseURI(ROOT_NODE, uri);
  else if (!input.isElement) tree.setDocumentURI(uri);
  return documentNode(tree.finish());
}

/** The document node of a finished tree. */
function documentNode(tree: Tree): XdmNode {
  return XdmNode.of(tree, ROOT_NODE);
}

/** How many nodes a source probably holds, when it is a string. */
function expectedNodes(source: Source): number | undefined {
  const text = typeof source === 'string' ? source : sourceObjectOf(source)?.text;
  if (text === undefined) return undefined;
  return Math.ceil(text.length / CHARACTERS_PER_NODE);
}

/** The system id a source names, which becomes the document's URI, or the base URI it gives, if any. */
function sourceField(source: Source, field: 'systemId' | 'baseURI'): string | null {
  if (typeof source !== 'object' || !(field in source)) return null;
  return (source as SourceObject)[field] ?? null;
}
