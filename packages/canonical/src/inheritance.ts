import { localPartOf, XML_NAMESPACE } from '@exemplarjs/xml/internal';
import { joinURIReferences } from './base.ts';
import type { CanonicalAttribute } from './render.ts';

/** An `xml:` attribute of an ancestor of the apex: its qualified name and value. */
export type AncestorAttribute = readonly [name: string, value: string];

/**
 * An apex element's attributes with the `xml:` attributes it takes on from its ancestors, given
 * outermost first: all of them for C14N 1.0; for 1.1, xml:lang and xml:space, and xml:base joined
 * onto its ancestors' (C14N 1.1 §2.4). An attribute of the apex's own is never replaced.
 */
export function withInheritedXmlAttributes(
  method: 'c14n' | 'c14n11',
  own: readonly CanonicalAttribute[],
  ancestors: readonly AncestorAttribute[]
): CanonicalAttribute[] {
  const byExpandedName = new Map(own.map((attribute) => [`${attribute[0]} ${attribute[1]}`, attribute]));
  const bases: string[] = [];
  // Nearest first, so that the nearest ancestor's value wins.
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const [name, value] = ancestors[i] as AncestorAttribute;
    const local = localPartOf(name);
    if (method === 'c14n11' && local === 'base') bases.unshift(value);
    else if (method === 'c14n' || local === 'lang' || local === 'space') {
      const key = `${XML_NAMESPACE} ${local}`;
      if (!byExpandedName.has(key)) byExpandedName.set(key, [XML_NAMESPACE, local, name, value]);
    }
  }
  if (bases.length > 0) joinBases(bases, byExpandedName);
  return [...byExpandedName.values()];
}

/** Sets the apex's xml:base to its own value joined onto its ancestors', given outermost first; none when that is empty. */
function joinBases(bases: string[], byExpandedName: Map<string, CanonicalAttribute>): void {
  const key = `${XML_NAMESPACE} base`;
  const own = byExpandedName.get(key);
  if (own !== undefined) bases.push(own[3]);
  // Innermost first, each value joined onto the one around it.
  const innermost = bases.length - 1;
  let joined = bases[innermost] as string;
  for (let i = innermost - 1; i >= 0; i--) joined = joinURIReferences(bases[i] as string, joined);
  if (joined === '') byExpandedName.delete(key);
  else byExpandedName.set(key, [XML_NAMESPACE, 'base', 'xml:base', joined]);
}
