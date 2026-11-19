import * as events from '@exemplarjs/xml';
import {
  copyString,
  cursorOf,
  type EntityListener,
  LISTEN_ENTITIES,
  resolveTargetURI,
  type StreamReader,
} from '@exemplarjs/xml/internal';
import { AttributeFlag, type Tree } from '@/tree/tree';
import type { TreeBuilder } from '@/tree/tree-builder';
import { OpenEntities } from './open-entities.ts';

type EventType = events.EventType;

// Module-level constants, so V8 can inline them; an imported binding is read again on every use.
const { START_ELEMENT, END_ELEMENT, PROCESSING_INSTRUCTION, CHARACTERS, COMMENT, SPACE, END_DOCUMENT, DTD, CDATA } =
  events.EventType;
const { ID, IDREFS, NONE } = AttributeFlag;

/** The AttributeFlag bits for a DTD attribute type. */
export function flagsOf(type: string): number {
  // CDATA, the most common type, returns first.
  if (type === 'CDATA') return NONE;
  if (type === 'ID') return ID;
  if (type === 'IDREF' || type === 'IDREFS') return IDREFS;
  return NONE;
}

/**
 * Builds a tree from a cursor's events, as XDM's construction from an Infoset asks: entities are
 * expanded, CDATA sections and adjacent text become one text node, the DTD is left out but for
 * its unparsed entities, and attributes keep whether the DTD makes them IDs or ID references.
 */
export class CursorLoader implements EntityListener {
  readonly reader: StreamReader;
  readonly #builder: TreeBuilder;
  /** The entities being expanded. */
  readonly #entities = new OpenEntities();
  /** The names of the external parsed entities the DTD declares. */
  readonly #externalEntities = new Set<string>();
  /** The namespace URI last seen, as the reader gave it, and the name table's copy of it. */
  #lastURI = '';
  #lastCopy = '';

  constructor(reader: StreamReader, builder: TreeBuilder) {
    this.reader = reader;
    this.#builder = builder;
    cursorOf(reader)[LISTEN_ENTITIES](this);
  }

  /** Adds what one event reports; returns true at the end of the document. */
  add(type: EventType): boolean {
    switch (type) {
      case START_ELEMENT: {
        this.#startElement();
        break;
      }
      case END_ELEMENT: {
        this.#builder.endElement();
        break;
      }
      case CHARACTERS:
      case SPACE:
      case CDATA: {
        this.#builder.text(this.reader.text());
        break;
      }
      default: {
        return this.#otherEvent(type);
      }
    }
    return false;
  }

  /** Adds what an event other than an element or text reports; returns true at the end of the document. */
  #otherEvent(type: EventType): boolean {
    const reader = this.reader;
    const builder = this.#builder;
    switch (type) {
      case COMMENT: {
        builder.comment(copyString(reader.text()));
        break;
      }
      case PROCESSING_INSTRUCTION: {
        const parent = builder.current;
        const target = builder.names.code(reader.piTarget(), '');
        const instruction = builder.processingInstruction(target, copyString(reader.piData()));
        if (this.#entities.length > 0) this.#entityBase(instruction, parent);
        break;
      }
      case DTD: {
        this.#dtd();
        break;
      }
      case END_DOCUMENT: {
        builder.endDocument();
        return true;
      }
      default:
      // START_DOCUMENT, and references to entities the parser did not read, which XDM has no node for.
    }
    return false;
  }

  /** Adds an element with its namespace declarations and attributes. */
  #startElement(): void {
    const reader = this.reader;
    const builder = this.#builder;
    const names = builder.names;
    const parent = builder.current;
    const uri = this.#namespace(reader.namespaceURI());
    const element = builder.startElement(names.code(reader.name(), uri));
    const declarationCount = reader.namespaceCount();
    for (let i = 0; i < declarationCount; i++) {
      const prefix = copyString(reader.namespacePrefix(i));
      builder.namespace(prefix, names.namespace(reader.namespaceURI(i)));
    }
    const attributeCount = reader.attributeCount();
    for (let i = 0; i < attributeCount; i++) {
      const attributeURI = this.#namespace(reader.attributeNamespace(i));
      const name = names.code(reader.attributeName(i), attributeURI);
      builder.attribute(name, copyString(reader.attributeValue(i)), flagsOf(reader.attributeType(i)));
    }
    if (this.#entities.length > 0) this.#entityBase(element, parent);
  }

  /** The name table's copy of a namespace URI; the reader gives one string per binding, so the last one usually matches. */
  #namespace(uri: string): string {
    if (uri !== this.#lastURI) {
      this.#lastURI = uri;
      this.#lastCopy = this.#builder.names.namespace(uri);
    }
    return this.#lastCopy;
  }

  /** Gives an element or processing instruction at the top of an external entity, directly or through internal ones, its URI. */
  #entityBase(node: number, parent: number): void {
    if (!this.#entities.atTopOfExternal(parent)) return;
    const uri = this.reader.location().systemId;
    if (uri !== undefined) this.#builder.setBaseURI(node, uri);
  }

  /** Takes the unparsed entities from the DTD, and the names of the external entities. */
  #dtd(): void {
    for (const entity of this.reader.doctype().entities) {
      if (entity.isParameterEntity || entity.systemId === undefined) continue;
      if (entity.notation === undefined) {
        this.#externalEntities.add(entity.name);
        continue;
      }
      this.#builder.addUnparsedEntity(entity.name, {
        systemId: resolveTargetURI(entity.systemId, entity.baseURI),
        publicId: entity.publicId ?? '',
      });
    }
  }

  /** Declares bindings on the element just added, as an element built on its own inherits them from its ancestors. */
  inherit(bindings: ReadonlyMap<string, string>): void {
    const names = this.#builder.names;
    for (const [prefix, uri] of bindings) this.#builder.namespace(prefix, names.namespace(uri));
  }

  /** The finished tree, once `add` has returned true. */
  finish(): Tree {
    return this.#builder.finish();
  }

  /** Notes an entity's expansion starting. */
  startEntity(name: string): void {
    this.#entities.start(this.#builder.current, this.#externalEntities.has(name));
  }

  /** Notes an entity's expansion ending. */
  endEntity(): void {
    this.#entities.end();
  }
}
