import { fc } from '@fast-check/vitest';
import { Decimal, Occurrence, XdmAtomicValue } from '@exemplarjs/xdm';
import type {
  Argument,
  AxisName,
  Expression,
  ItemTypeSyntax,
  KindTest,
  NodeTestSyntax,
  SequenceTypeSyntax,
  SingleType,
  UnresolvedName,
  VariableBinding,
} from '@/internal';

/** No span: the round trip compares trees without them. */
const NO_SPAN = { start: 0, end: 0 };

/** Names without colons, keywords among them, so that keywords are tested as names. */
const ncName = fc.constantFrom(
  'a',
  'x1',
  'été',
  'a-b',
  'a.b',
  '_z',
  'for',
  'div',
  'if',
  'map',
  'node',
  'text',
  'item',
  'Q'
);

/** The names a function cannot have without a prefix. */
const RESERVED = new Set(['if', 'map', 'node', 'text', 'item']);

/** Any name: plain, prefixed or with a braced URI. */
const name: fc.Arbitrary<UnresolvedName> = fc.oneof(
  ncName.map((localName) => ({ ...NO_SPAN, prefix: '', namespaceURI: undefined, localName })),
  fc
    .tuple(fc.constantFrom('p', 'xs', 'fn'), ncName)
    .map(([prefix, localName]) => ({ ...NO_SPAN, prefix, namespaceURI: undefined, localName })),
  fc
    .tuple(fc.constantFrom('', 'u', 'https://e.com/a b'), ncName)
    .map(([namespaceURI, localName]) => ({ ...NO_SPAN, prefix: '', namespaceURI, localName }))
);

/** A name a function call or reference can have. */
const functionName = name.filter(
  (candidate) => candidate.prefix !== '' || candidate.namespaceURI !== undefined || !RESERVED.has(candidate.localName)
);

const AXES: AxisName[] = [
  'child',
  'descendant',
  'attribute',
  'self',
  'descendant-or-self',
  'following-sibling',
  'following',
];
const axis = fc.constantFrom<AxisName>(
  ...AXES,
  'namespace',
  'parent',
  'ancestor',
  'preceding-sibling',
  'preceding',
  'ancestor-or-self'
);

/** A literal of each type the parser makes. */
const literalValue = fc.oneof(
  fc.bigInt({ min: 0n, max: 10n ** 30n }).map((value) => XdmAtomicValue.integer(value)),
  fc
    .tuple(fc.bigInt({ min: 0n, max: 10n ** 20n }), fc.integer({ min: 1, max: 12 }))
    .map(([digits, scale]) => XdmAtomicValue.decimal(Decimal.of(digits, scale))),
  fc.double({ min: 0, noNaN: true }).map((value) => XdmAtomicValue.double(Math.abs(value))),
  fc.string({ unit: 'grapheme', maxLength: 6 }).map((text) => XdmAtomicValue.string(text))
);

/** An element test, alone or inside a document test. */
const elementTest = fc
  .tuple(fc.option(name, { nil: undefined }), fc.option(name, { nil: undefined }), fc.boolean())
  .map(([elementName, typeName, nillable]) => ({
    ...NO_SPAN,
    kind: 'element-test' as const,
    name: elementName,
    typeName,
    nillable: typeName !== undefined && nillable,
  }));

/** The element test of a document test: an element test or a schema element test. */
const schemaElementTest = name.map((schemaName) => ({
  ...NO_SPAN,
  kind: 'schema-element-test' as const,
  name: schemaName,
}));
const documentElementTest = fc.oneof(elementTest, schemaElementTest);

/** A kind test of each kind. */
const kindTest: fc.Arbitrary<KindTest> = fc.oneof(
  fc
    .constantFrom('any-kind-test', 'comment-test', 'text-test', 'namespace-node-test')
    .map((kind) => ({ ...NO_SPAN, kind }) as KindTest),
  elementTest,
  fc
    .tuple(fc.option(name, { nil: undefined }), fc.option(name, { nil: undefined }))
    .map(([attributeName, typeName]) => ({
      ...NO_SPAN,
      kind: 'attribute-test' as const,
      name: attributeName,
      typeName,
    })),
  fc
    .tuple(fc.constantFrom('schema-element-test' as const, 'schema-attribute-test' as const), name)
    .map(([kind, schemaName]) => ({ ...NO_SPAN, kind, name: schemaName })),
  fc
    .option(ncName, { nil: undefined })
    .map((target) => ({ ...NO_SPAN, kind: 'processing-instruction-test' as const, target })),
  fc
    .option(documentElementTest, { nil: undefined })
    .map((test) => ({ ...NO_SPAN, kind: 'document-test' as const, elementTest: test }))
);

/** A node test: a kind test, a name test or a wildcard. */
const nodeTest: fc.Arbitrary<NodeTestSyntax> = fc.oneof(
  kindTest,
  name.map((testName) => ({ ...NO_SPAN, kind: 'name-test' as const, name: testName })),
  fc.constant({ ...NO_SPAN, kind: 'any-name-test' as const }),
  fc.oneof(
    fc
      .constantFrom('p', 'xs')
      .map((prefix) => ({ ...NO_SPAN, kind: 'namespace-test' as const, prefix, namespaceURI: undefined })),
    fc
      .constantFrom('', 'u')
      .map((namespaceURI) => ({ ...NO_SPAN, kind: 'namespace-test' as const, prefix: '', namespaceURI }))
  ),
  ncName.map((localName) => ({ ...NO_SPAN, kind: 'local-name-test' as const, localName }))
);

const occurrence = fc.constantFrom(...Object.values(Occurrence));

/** Sequence types and item types, nesting a few levels deep. */
const { sequenceType } = fc.letrec<{ sequenceType: SequenceTypeSyntax; itemType: ItemTypeSyntax }>((tie) => {
  const parameterTypes = fc.array(tie('sequenceType'), { maxLength: 2 });
  return {
    sequenceType: fc.oneof(
      { depthSize: 'small' },
      fc.constant({ ...NO_SPAN, kind: 'empty-sequence-type' as const }),
      fc
        .tuple(tie('itemType'), occurrence)
        .map(([itemType, indicator]) => ({
          ...NO_SPAN,
          kind: 'item-sequence-type' as const,
          itemType,
          occurrence: indicator,
        }))
    ),
    itemType: fc.oneof(
      { depthSize: 'small', maxDepth: 3 },
      fc
        .constantFrom('any-item-test', 'any-function-test', 'any-map-test', 'any-array-test')
        .map((kind) => ({ ...NO_SPAN, kind }) as ItemTypeSyntax),
      name.map((typeName) => ({ ...NO_SPAN, kind: 'atomic-or-union-type' as const, name: typeName })),
      kindTest,
      fc
        .tuple(parameterTypes, tie('sequenceType'))
        .map(([parameterTypes, returnType]) => ({
          ...NO_SPAN,
          kind: 'typed-function-test' as const,
          parameterTypes,
          returnType,
        })),
      fc
        .tuple(name, tie('sequenceType'))
        .map(([keyName, valueType]) => ({
          ...NO_SPAN,
          kind: 'typed-map-test' as const,
          keyType: { ...NO_SPAN, kind: 'atomic-or-union-type' as const, name: keyName },
          valueType,
        })),
      tie('sequenceType').map((memberType) => ({ ...NO_SPAN, kind: 'typed-array-test' as const, memberType }))
    ) as fc.Arbitrary<ItemTypeSyntax>,
  };
});

const singleType: fc.Arbitrary<SingleType> = fc
  .tuple(name, fc.boolean())
  .map(([typeName, allowsEmpty]) => ({ ...NO_SPAN, kind: 'single-type', name: typeName, allowsEmpty }));

/** A binary expression's kind and operator. */
const binaryOperator = fc.constantFrom(
  ...(['or', 'and'] as const).map((operator) => ['logical', operator] as const),
  ...(['eq', 'ne', 'lt', 'le', 'gt', 'ge', '=', '!=', '<', '<=', '>', '>=', 'is', '<<', '>>'] as const).map(
    (operator) => ['comparison', operator] as const
  ),
  ...(['+', '-', '*', 'div', 'idiv', 'mod'] as const).map((operator) => ['arithmetic', operator] as const),
  ...(['union', 'intersect', 'except'] as const).map((operator) => ['set-operation', operator] as const),
  ['string-concatenation', undefined] as const,
  ['range', undefined] as const,
  ['simple-map', undefined] as const
);

/** Random syntax trees of every kind of expression the parser makes. */
export const expression: fc.Arbitrary<Expression> = fc.letrec<{ expression: Expression; argument: Argument }>((tie) => {
  const sub = tie('expression');
  const argumentList = fc.array(tie('argument'), { maxLength: 3 });
  const bindings = fc.array(
    fc
      .tuple(name, sub)
      .map(([bindingName, bound]): VariableBinding => ({ ...NO_SPAN, name: bindingName, expression: bound })),
    { minLength: 1, maxLength: 2 }
  );
  const key = fc.oneof(fc.constant('*' as const), sub);
  const optionalType = fc.option(sequenceType, { nil: undefined });
  const parameter = fc.tuple(name, optionalType);
  const leaves = fc.oneof(
    literalValue.map((value) => ({ ...NO_SPAN, kind: 'literal' as const, value })),
    name.map((variableName) => ({ ...NO_SPAN, kind: 'variable-reference' as const, name: variableName })),
    fc.constantFrom('context-item' as const, 'root' as const).map((kind) => ({ ...NO_SPAN, kind })),
    fc
      .tuple(functionName, fc.integer({ min: 0, max: 3 }))
      .map(([functionNamed, arity]) => ({
        ...NO_SPAN,
        kind: 'named-function-reference' as const,
        name: functionNamed,
        arity,
      }))
  );
  return {
    argument: fc.oneof(fc.constant({ ...NO_SPAN, kind: 'argument-placeholder' as const }), sub),
    expression: fc.oneof(
      { depthSize: 'small', maxDepth: 4 },
      leaves,
      fc
        .tuple(axis, nodeTest, fc.array(sub, { maxLength: 2 }))
        .map(([stepAxis, test, predicates]) => ({
          ...NO_SPAN,
          kind: 'axis-step' as const,
          axis: stepAxis,
          nodeTest: test,
          predicates,
        })),
      fc
        .array(sub, { maxLength: 3 })
        .filter((items) => items.length !== 1)
        .map((items) => ({ ...NO_SPAN, kind: 'sequence' as const, items })),
      fc
        .tuple(functionName, argumentList)
        .map(([callee, args]) => ({ ...NO_SPAN, kind: 'function-call' as const, name: callee, arguments: args })),
      fc
        .tuple(fc.array(parameter, { maxLength: 2 }), optionalType, sub)
        .map(([parameters, returnType, body]) => ({
          ...NO_SPAN,
          kind: 'inline-function' as const,
          parameters: parameters.map(([parameterName, type]) => ({ ...NO_SPAN, name: parameterName, type })),
          returnType,
          body,
        })),
      fc
        .array(fc.tuple(sub, sub), { maxLength: 2 })
        .map((entries) => ({
          ...NO_SPAN,
          kind: 'map-constructor' as const,
          entries: entries.map(([entryKey, value]) => ({ key: entryKey, value })),
        })),
      fc
        .array(sub, { maxLength: 3 })
        .map((members) => ({ ...NO_SPAN, kind: 'square-array-constructor' as const, members })),
      sub.map((content) => ({ ...NO_SPAN, kind: 'curly-array-constructor' as const, content })),
      fc.tuple(sub, key).map(([base, lookupKey]) => ({ ...NO_SPAN, kind: 'lookup' as const, base, key: lookupKey })),
      key.map((lookupKey) => ({ ...NO_SPAN, kind: 'unary-lookup' as const, key: lookupKey })),
      fc.tuple(sub, sub).map(([base, predicate]) => ({ ...NO_SPAN, kind: 'filter' as const, base, predicate })),
      fc
        .tuple(sub, argumentList)
        .map(([callee, args]) => ({ ...NO_SPAN, kind: 'dynamic-call' as const, function: callee, arguments: args })),
      fc.array(sub, { minLength: 2, maxLength: 3 }).map((steps) => ({ ...NO_SPAN, kind: 'path' as const, steps })),
      fc
        .tuple(binaryOperator, sub, sub)
        .map(
          ([[kind, operator], left, right]) =>
            ({ ...NO_SPAN, kind, ...(operator !== undefined && { operator }), left, right }) as Expression
        ),
      fc
        .tuple(fc.constantFrom('+' as const, '-' as const), sub)
        .map(([operator, operand]) => ({ ...NO_SPAN, kind: 'unary' as const, operator, operand })),
      fc
        .tuple(fc.constantFrom('instance-of' as const, 'treat-as' as const), sub, sequenceType)
        .map(([kind, operand, type]) => ({ ...NO_SPAN, kind, operand, type })),
      fc
        .tuple(fc.constantFrom('castable-as' as const, 'cast-as' as const), sub, singleType)
        .map(([kind, operand, type]) => ({ ...NO_SPAN, kind, operand, type })),
      fc
        .tuple(sub, name, argumentList)
        .map(([operand, arrowName, args]) => ({
          ...NO_SPAN,
          kind: 'static-arrow' as const,
          operand,
          name: arrowName,
          arguments: args,
        })),
      fc
        .tuple(sub, sub, argumentList)
        .map(([operand, callee, args]) => ({
          ...NO_SPAN,
          kind: 'dynamic-arrow' as const,
          operand,
          function: callee,
          arguments: args,
        })),
      fc
        .tuple(fc.constantFrom('for' as const, 'let' as const), bindings, sub)
        .map(([kind, bound, body]) => ({ ...NO_SPAN, kind, bindings: bound, body })),
      fc
        .tuple(fc.constantFrom('some' as const, 'every' as const), bindings, sub)
        .map(([quantifier, bound, condition]) => ({
          ...NO_SPAN,
          kind: 'quantified' as const,
          quantifier,
          bindings: bound,
          condition,
        })),
      fc
        .tuple(sub, sub, sub)
        .map(([condition, thenExpression, elseExpression]) => ({
          ...NO_SPAN,
          kind: 'if' as const,
          condition,
          thenExpression,
          elseExpression,
        }))
    ) as fc.Arbitrary<Expression>,
  };
}).expression;
