import type { DeclarationStore } from '@/dtd/store';
import { ScanFlag } from '@/scan/scanner';
import { Token, type Tokenizer } from '@/tokenizer/tokenizer';
import { decodeReferences, normalizeLineEnds } from '@/util/normalize';
import { copyString } from './internal.ts';
import type { Doctype } from './stream-reader.ts';

// Module-level constants, so V8 can inline them; imported bindings are read again on every use.
const { TEXT: TEXT_TOKEN, CDATA: CDATA_TOKEN, COMMENT: COMMENT_TOKEN, DOCTYPE: DOCTYPE_TOKEN } = Token;
const { CR: CR_FLAG, NEL: NEL_FLAG, REFERENCE: REFERENCE_FLAG } = ScanFlag;

/** The text of `tokenizer`'s current token: character data, CDATA or a comment, normalized; a DOCTYPE's whole declaration; or `''` for any other token. */
export function tokenText(tokenizer: Tokenizer): string {
  switch (tokenizer.kind) {
    case TEXT_TOKEN:
    case CDATA_TOKEN:
    case COMMENT_TOKEN: {
      const start = tokenizer.valueStart;
      // A one-character span comes from V8's table of single-character strings, without a slice.
      const text =
        tokenizer.valueEnd - start === 1
          ? tokenizer.buffer.charAt(start)
          : tokenizer.buffer.slice(start, tokenizer.valueEnd);
      // Only character data holds references; CDATA and comments are taken as written.
      const hasReferences = tokenizer.kind === TEXT_TOKEN;
      const lineEndFlags = tokenizer.isReplacementText ? 0 : CR_FLAG | NEL_FLAG;
      const flags = tokenizer.valueFlags & (lineEndFlags | (hasReferences ? REFERENCE_FLAG : 0));
      if (flags === 0) return text;
      // Replacement text's line ends were normalized when its entity was declared.
      const normalized = tokenizer.isReplacementText ? text : normalizeLineEnds(text, tokenizer.version11);
      return (flags & REFERENCE_FLAG) === 0 ? normalized : decodeReferences(normalized);
    }
    case DOCTYPE_TOKEN: {
      return tokenizer.buffer.slice(tokenizer.tokenStart, tokenizer.nextTokenStart);
    }
    default: {
      return '';
    }
  }
}

/**
 * The data of `tokenizer`'s current processing instruction, without the whitespace after the target,
 * with its line ends normalized. With `copyStrings`, a plain slice is copied so it doesn't hold the buffer.
 */
export function piData(tokenizer: Tokenizer, copyStrings: boolean): string {
  const data = tokenizer.buffer.slice(tokenizer.valueStart, tokenizer.valueEnd);
  if (tokenizer.isReplacementText || (tokenizer.valueFlags & (CR_FLAG | NEL_FLAG)) === 0)
    return copyStrings ? copyString(data) : data;
  return normalizeLineEnds(data, tokenizer.version11);
}

/** The DOCTYPE `tokenizer` holds: its name, identifiers and internal subset, with the entities and notations `store` declares. */
export function doctypeOf(tokenizer: Tokenizer, store: DeclarationStore): Doctype {
  const doctype = tokenizer.doctype;
  return {
    name: tokenizer.buffer.slice(tokenizer.nameStart, tokenizer.nameEnd),
    ...(doctype.publicId !== undefined && { publicId: doctype.publicId }),
    ...(doctype.systemId !== undefined && { systemId: doctype.systemId }),
    ...(doctype.subsetStart >= 0 && { internalSubset: tokenizer.buffer.slice(doctype.subsetStart, doctype.subsetEnd) }),
    entities: [...store.generalEntities.values()],
    notations: [...store.notations.values()],
    processingInstructions: store.processingInstructions,
  };
}
