import type { XMLError } from '@exemplarjs/xml';
import type { Attributes, Locator, SAXHandler } from './handler.ts';

/** For each handler method, the handler a filter's events of that kind go to. */
type Targets = Record<keyof SAXHandler, SAXHandler>;

/**
 * Sits between the parser and a handler, passing every event on. Override methods to change
 * events, calling `super` to pass them on:
 *
 * ```ts
 * class Upper extends XMLFilterImpl {
 *   override characters(text: string) {
 *     super.characters(text.toUpperCase());
 *   }
 * }
 * new SAXParser().parse(source, new Upper(handler));
 * ```
 *
 * Filters chain, each one's `handler` being the next. An event goes straight to the next handler
 * that does something with it, in one call, however many filters only pass it on. `handler` can
 * be set at any time, also while parsing.
 */
export class XMLFilterImpl implements SAXHandler {
  #handler: SAXHandler;
  #targets: Targets;
  /** The one filter passing events to this one, told when where they go changes. */
  #upstreamFilter: XMLFilterImpl | undefined;
  /** Whether several filters pass events to this one; they then call it rather than skip past it. */
  #hasSeveralUpstream = false;

  constructor(handler: SAXHandler = {}) {
    this.#handler = handler;
    this.#joinChain();
    this.#targets = this.#linkedTargets();
  }

  /** The handler events are passed to. */
  get handler(): SAXHandler {
    return this.#handler;
  }

  set handler(handler: SAXHandler) {
    const previous = this.#handler;
    if (previous instanceof XMLFilterImpl && previous.#upstreamFilter === this) previous.#upstreamFilter = undefined;
    this.#handler = handler;
    this.#joinChain();
    this.#relink();
  }

  /** Has the next handler, when it is a filter, tell this one when its events go elsewhere. */
  #joinChain(): void {
    const next = this.#handler;
    if (!(next instanceof XMLFilterImpl) || next.#hasSeveralUpstream) return;
    const earlier = next.#upstreamFilter;
    if (earlier === undefined) {
      next.#upstreamFilter = this;
      return;
    }
    // A second filter passes events to it: from now on neither skips past it.
    next.#hasSeveralUpstream = true;
    next.#upstreamFilter = undefined;
    earlier.#relink();
  }

  /** Works out again where events go, here and in the filters that skip past this one. */
  #relink(): void {
    this.#targets = this.#linkedTargets();
    const upstream = this.#upstreamFilter;
    if (upstream !== undefined) upstream.#relink();
  }

  /** Where each kind of event goes now: the next handler, or past it when it is a filter that would only pass the event on. */
  #linkedTargets(): Targets {
    const next = this.#handler;
    const skipsNext = next instanceof XMLFilterImpl && !next.#hasSeveralUpstream;
    const to = (name: keyof SAXHandler): SAXHandler =>
      skipsNext && next[name] === XMLFilterImpl.prototype[name] ? next.#targets[name] : next;
    return {
      setDocumentLocator: to('setDocumentLocator'),
      startDocument: to('startDocument'),
      endDocument: to('endDocument'),
      startPrefixMapping: to('startPrefixMapping'),
      endPrefixMapping: to('endPrefixMapping'),
      startElement: to('startElement'),
      endElement: to('endElement'),
      characters: to('characters'),
      ignorableWhitespace: to('ignorableWhitespace'),
      processingInstruction: to('processingInstruction'),
      skippedEntity: to('skippedEntity'),
      startDTD: to('startDTD'),
      endDTD: to('endDTD'),
      startEntity: to('startEntity'),
      endEntity: to('endEntity'),
      startCDATA: to('startCDATA'),
      endCDATA: to('endCDATA'),
      comment: to('comment'),
      elementDecl: to('elementDecl'),
      attributeDecl: to('attributeDecl'),
      internalEntityDecl: to('internalEntityDecl'),
      externalEntityDecl: to('externalEntityDecl'),
      notationDecl: to('notationDecl'),
      unparsedEntityDecl: to('unparsedEntityDecl'),
      warning: to('warning'),
      error: to('error'),
      fatalError: to('fatalError'),
    };
  }

  setDocumentLocator(locator: Locator): void {
    this.#targets.setDocumentLocator.setDocumentLocator?.(locator);
  }

  startDocument(): void {
    this.#targets.startDocument.startDocument?.();
  }

  endDocument(): void {
    this.#targets.endDocument.endDocument?.();
  }

  startPrefixMapping(prefix: string, uri: string): void {
    this.#targets.startPrefixMapping.startPrefixMapping?.(prefix, uri);
  }

  endPrefixMapping(prefix: string): void {
    this.#targets.endPrefixMapping.endPrefixMapping?.(prefix);
  }

  startElement(uri: string, localName: string, qName: string, attributes: Attributes): void {
    this.#targets.startElement.startElement?.(uri, localName, qName, attributes);
  }

  endElement(uri: string, localName: string, qName: string): void {
    this.#targets.endElement.endElement?.(uri, localName, qName);
  }

  characters(text: string): void {
    this.#targets.characters.characters?.(text);
  }

  ignorableWhitespace(text: string): void {
    this.#targets.ignorableWhitespace.ignorableWhitespace?.(text);
  }

  processingInstruction(target: string, data: string): void {
    this.#targets.processingInstruction.processingInstruction?.(target, data);
  }

  skippedEntity(name: string): void {
    this.#targets.skippedEntity.skippedEntity?.(name);
  }

  startDTD(name: string, publicId: string | undefined, systemId: string | undefined): void {
    this.#targets.startDTD.startDTD?.(name, publicId, systemId);
  }

  endDTD(): void {
    this.#targets.endDTD.endDTD?.();
  }

  startEntity(name: string): void {
    this.#targets.startEntity.startEntity?.(name);
  }

  endEntity(name: string): void {
    this.#targets.endEntity.endEntity?.(name);
  }

  startCDATA(): void {
    this.#targets.startCDATA.startCDATA?.();
  }

  endCDATA(): void {
    this.#targets.endCDATA.endCDATA?.();
  }

  comment(text: string): void {
    this.#targets.comment.comment?.(text);
  }

  elementDecl(name: string, model: string): void {
    this.#targets.elementDecl.elementDecl?.(name, model);
  }

  attributeDecl(
    elementName: string,
    attributeName: string,
    type: string,
    mode: string | undefined,
    value: string | undefined
  ): void {
    this.#targets.attributeDecl.attributeDecl?.(elementName, attributeName, type, mode, value);
  }

  internalEntityDecl(name: string, value: string): void {
    this.#targets.internalEntityDecl.internalEntityDecl?.(name, value);
  }

  externalEntityDecl(name: string, publicId: string | undefined, systemId: string): void {
    this.#targets.externalEntityDecl.externalEntityDecl?.(name, publicId, systemId);
  }

  notationDecl(name: string, publicId: string | undefined, systemId: string | undefined): void {
    this.#targets.notationDecl.notationDecl?.(name, publicId, systemId);
  }

  unparsedEntityDecl(name: string, publicId: string | undefined, systemId: string, notationName: string): void {
    this.#targets.unparsedEntityDecl.unparsedEntityDecl?.(name, publicId, systemId, notationName);
  }

  warning(error: XMLError): void {
    this.#targets.warning.warning?.(error);
  }

  /** Passes a recoverable error on; with no handler for it, it is thrown, as the cursor does. */
  error(error: XMLError): void {
    const target = this.#targets.error;
    if (target.error === undefined) throw error;
    target.error(error);
  }

  fatalError(error: XMLError): void {
    this.#targets.fatalError.fatalError?.(error);
  }
}
