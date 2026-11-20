/** A qualified name: the local name, after the prefix and a colon when there is one. */
export function qualifiedName(prefix: string, localName: string): string {
  return prefix === '' ? localName : `${prefix}:${localName}`;
}

/** Whether a set of element names holds an element, by qualified name or by expanded name as `{uri}local`. */
export function namesElement(
  names: ReadonlySet<string>,
  qualified: string,
  namespaceURI: string,
  localName: string
): boolean {
  return names.has(qualified) || names.has(`{${namespaceURI}}${localName}`);
}
