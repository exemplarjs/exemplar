import type { ItemTypeSyntax, SequenceTypeSyntax, UnresolvedName } from '@/syntax/syntax-tree';

/** A name as written: `local`, `prefix:local` or `Q{uri}local`. */
export function printName(name: UnresolvedName): string {
  if (name.namespaceURI !== undefined) return `Q{${name.namespaceURI}}${name.localName}`;
  return name.prefix === '' ? name.localName : `${name.prefix}:${name.localName}`;
}

/** An optional name, `*` when absent. */
function nameOrWildcard(name: UnresolvedName | undefined): string {
  return name === undefined ? '*' : printName(name);
}

/** An item type; function tests go in parentheses, so that an occurrence indicator after them is theirs. */
export function printItemType(itemType: ItemTypeSyntax): string {
  switch (itemType.kind) {
    case 'any-item-test': {
      return 'item()';
    }
    case 'atomic-or-union-type': {
      return printName(itemType.name);
    }
    case 'any-kind-test': {
      return 'node()';
    }
    case 'document-test': {
      return `document-node(${itemType.elementTest === undefined ? '' : printItemType(itemType.elementTest)})`;
    }
    case 'element-test':
    case 'attribute-test': {
      const keyword = itemType.kind === 'element-test' ? 'element' : 'attribute';
      if (itemType.typeName === undefined)
        return `${keyword}(${itemType.name === undefined ? '' : printName(itemType.name)})`;
      const nillable = itemType.kind === 'element-test' && itemType.nillable ? '?' : '';
      return `${keyword}(${nameOrWildcard(itemType.name)}, ${printName(itemType.typeName)}${nillable})`;
    }
    case 'schema-element-test': {
      return `schema-element(${printName(itemType.name)})`;
    }
    case 'schema-attribute-test': {
      return `schema-attribute(${printName(itemType.name)})`;
    }
    case 'processing-instruction-test': {
      return `processing-instruction(${itemType.target ?? ''})`;
    }
    case 'comment-test': {
      return 'comment()';
    }
    case 'text-test': {
      return 'text()';
    }
    case 'namespace-node-test': {
      return 'namespace-node()';
    }
    case 'any-function-test': {
      return 'function(*)';
    }
    case 'typed-function-test': {
      const parameters = itemType.parameterTypes.map((type) => printSequenceType(type)).join(', ');
      return `(function(${parameters}) as ${printSequenceType(itemType.returnType)})`;
    }
    case 'any-map-test': {
      return 'map(*)';
    }
    case 'typed-map-test': {
      return `map(${printName(itemType.keyType.name)}, ${printSequenceType(itemType.valueType)})`;
    }
    case 'any-array-test': {
      return 'array(*)';
    }
    default: {
      return `array(${printSequenceType(itemType.memberType)})`;
    }
  }
}

/** A sequence type. */
export function printSequenceType(type: SequenceTypeSyntax): string {
  return type.kind === 'empty-sequence-type' ? 'empty-sequence()' : `${printItemType(type.itemType)}${type.occurrence}`;
}
