import { isAsciiDigit } from '@exemplarjs/xml/internal';
import { checkQName, fail } from '@/names';
import { DocumentType } from './document-type.ts';
import { Document } from './document.ts';
import { hasFeature } from './features.ts';

/** Finds DOM implementations by the features they have, as DOM Level 3's bootstrapping registry does. */
export const DOMImplementationRegistry = {
  /** The implementation with every feature in a list such as `"Core 3.0 XML"`, or null. */
  getDOMImplementation(features: string): DOMImplementation | null {
    return this.getDOMImplementationList(features).item(0);
  },

  /** The implementations with every feature listed. */
  getDOMImplementationList(features: string): {
    readonly length: number;
    item(index: number): DOMImplementation | null;
  } {
    const implementation = new DOMImplementation();
    const tokens = features.trim().split(/\s+/).filter(Boolean);
    let fits = true;
    for (let i = 0; i < tokens.length; i++) {
      const feature = tokens[i] as string;
      // A token starting with a digit is the version of the feature before it.
      let version: string | null = null;
      const next = tokens[i + 1];
      if (next !== undefined && isAsciiDigit(next[0])) {
        version = next;
        i++;
      }
      fits &&= implementation.hasFeature(feature, version);
    }
    const found = fits ? [implementation] : [];
    return { length: found.length, item: (index: number) => found[index] ?? null };
  },
};

/** What `getAttribute` gives for a missing attribute: null, as browsers do, or the empty string, as DOM Level 3 says. */
export type MissingAttribute = 'null' | 'empty';

/** The DOM implementation: which features it has, and how to make documents and document types. */
export class DOMImplementation {
  /** What `getAttribute` gives for an attribute an element lacks. @internal */
  readonly _missingAttribute: string | null;

  /** An implementation whose elements give null for a missing attribute, or with `'empty'`, the empty string. */
  constructor(options: { readonly missingAttribute?: MissingAttribute } = {}) {
    this._missingAttribute = options.missingAttribute === 'empty' ? '' : null;
  }

  hasFeature(feature: string, version: string | null): boolean {
    return hasFeature(feature, version);
  }

  getFeature(feature: string, version: string | null): unknown {
    return this.hasFeature(feature, version) ? this : null;
  }

  createDocumentType(qualifiedName: string, publicId: string | null, systemId: string | null): DocumentType {
    checkQName(qualifiedName);
    return new DocumentType(null, qualifiedName, publicId, systemId, null);
  }

  createDocument(namespaceURI: string | null, qualifiedName: string | null, doctype: DocumentType | null): Document {
    if (doctype !== null && (doctype._owner !== null || doctype._parent !== null)) {
      fail('WrongDocumentError', 'The document type belongs to another document');
    }
    const document = new Document(this);
    if (doctype !== null) {
      doctype._owner = document;
      for (const declaration of [...doctype._entities, ...doctype._notations]) declaration._owner = document;
      document._append(doctype);
    }
    if (qualifiedName !== null) {
      document._append(document.createElementNS(namespaceURI, qualifiedName));
    } else if (namespaceURI !== null && namespaceURI !== '') {
      fail('NamespaceError', 'A namespace needs a qualified name');
    }
    return document;
  }
}
