import { type Decimal, type XdmAtomicValue, XS } from '@exemplarjs/xdm';
import type {
  Argument,
  AxisStep,
  Expression,
  LookupKey,
  MapEntry,
  NodeTestSyntax,
  SequenceTypeSyntax,
  SingleType,
  UnresolvedName,
} from '@/internal';
import { printItemType, printName, printSequenceType } from '@/static/type-text';

/** The kinds that print as one unit, needing no parentheses as an operand. */
const ATOMS = new Set<string>([
  'literal',
  'variable-reference',
  'context-item',
  'sequence',
  'function-call',
  'named-function-reference',
  'inline-function',
  'map-constructor',
  'square-array-constructor',
  'curly-array-constructor',
  'lookup',
  'unary-lookup',
  'filter',
  'dynamic-call',
  'axis-step',
]);

/** A literal, written so that it parses back to the same type and value. */
function printLiteral(value: XdmAtomicValue): string {
  if (value.type === XS.string) return `"${(value.value as string).replaceAll('"', '""')}"`;
  if (value.type === XS.integer) return String(value.value);
  if (value.type === XS.decimal) {
    const text = (value.value as Decimal).toString();
    return text.includes('.') ? text : `${text}.0`;
  }
  const double = value.value as number;
  return Number.isFinite(double) ? double.toExponential() : '1e999';
}

/** An expression as an operand: in parentheses unless it prints as one unit. */
function operand(expression: Expression): string {
  return ATOMS.has(expression.kind) ? printXPath(expression) : `(${printXPath(expression)})`;
}

/** The base of a predicate, call or lookup: in parentheses when it is a step, whose predicates would otherwise take it. */
function postfixBase(expression: Expression): string {
  return expression.kind === 'axis-step' ? `(${printXPath(expression)})` : operand(expression);
}

/** Arguments in parentheses, with `?` for placeholders. */
function printArguments(argumentList: readonly Argument[]): string {
  const printed = argumentList.map((argument) => (argument.kind === 'argument-placeholder' ? '?' : operand(argument)));
  return `(${printed.join(', ')})`;
}

/** A lookup key: `*`, or an expression in parentheses. */
function printKey(key: LookupKey): string {
  return key === '*' ? '*' : `(${printXPath(key)})`;
}

/** A node test. */
function printNodeTest(nodeTest: NodeTestSyntax): string {
  switch (nodeTest.kind) {
    case 'name-test': {
      return printName(nodeTest.name);
    }
    case 'any-name-test': {
      return '*';
    }
    case 'namespace-test': {
      return nodeTest.namespaceURI === undefined ? `${nodeTest.prefix}:*` : `Q{${nodeTest.namespaceURI}}*`;
    }
    case 'local-name-test': {
      return `*:${nodeTest.localName}`;
    }
    default: {
      return printItemType(nodeTest);
    }
  }
}

/** An axis step, its axis written out. */
function printStep(step: AxisStep): string {
  const predicates = step.predicates.map((predicate) => `[${printXPath(predicate)}]`).join('');
  return `${step.axis}::${printNodeTest(step.nodeTest)}${predicates}`;
}

/** A single type. */
function printSingleType(type: SingleType): string {
  return `${printName(type.name)}${type.allowsEmpty ? '?' : ''}`;
}

/** One step of a path: an axis step as it is, a leading root as nothing before the first `/`, anything else as an operand. */
function printPathStep(step: Expression, index: number): string {
  if (index === 0 && step.kind === 'root') return '';
  return step.kind === 'axis-step' ? printStep(step) : operand(step);
}

/** A path's steps joined by `/`. */
function printPath(steps: readonly Expression[]): string {
  return steps.map((step, index) => printPathStep(step, index)).join('/');
}

/** ` as type` for a declared type, or nothing. */
function printDeclaredType(type: SequenceTypeSyntax | undefined): string {
  return type === undefined ? '' : ' as ' + printSequenceType(type);
}

/** A map constructor's entry, `key : value`. */
function printEntry(entry: MapEntry): string {
  return `${operand(entry.key)} : ${operand(entry.value)}`;
}

/** The symbols of the operations that have no operator of their own. */
const OPERATION_SYMBOLS: Readonly<Record<string, string>> = {
  'string-concatenation': '||',
  range: 'to',
  'simple-map': '!',
};

/** Bindings of a `for`, `some` or `every` (`in`), or of a `let` (`:=`). */
function printBindings(
  bindings: readonly { name: UnresolvedName; expression: Expression }[],
  separator: string
): string {
  return bindings
    .map((binding) => `$${printName(binding.name)} ${separator} ${operand(binding.expression)}`)
    .join(', ');
}

/**
 * Writes a syntax tree as XPath with everything explicit: every axis written out, every compound
 * operand in parentheses. Parsing the text gives the same tree, spans aside.
 */
export function printXPath(expression: Expression): string {
  switch (expression.kind) {
    case 'literal': {
      return printLiteral(expression.value);
    }
    case 'variable-reference': {
      return `$${printName(expression.name)}`;
    }
    case 'context-item': {
      return '.';
    }
    case 'root': {
      return '/';
    }
    case 'sequence': {
      return `(${expression.items.map((item) => operand(item)).join(', ')})`;
    }
    case 'function-call': {
      return `${printName(expression.name)}${printArguments(expression.arguments)}`;
    }
    case 'named-function-reference': {
      return `${printName(expression.name)}#${expression.arity}`;
    }
    case 'inline-function': {
      const parameters = expression.parameters.map(
        (parameter) => `$${printName(parameter.name)}${printDeclaredType(parameter.type)}`
      );
      const returnType = printDeclaredType(expression.returnType);
      return `function(${parameters.join(', ')})${returnType} { ${printXPath(expression.body)} }`;
    }
    case 'map-constructor': {
      return `map { ${expression.entries.map((entry) => printEntry(entry)).join(', ')} }`;
    }
    case 'square-array-constructor': {
      return `[${expression.members.map((member) => operand(member)).join(', ')}]`;
    }
    case 'curly-array-constructor': {
      return `array { ${printXPath(expression.content)} }`;
    }
    case 'lookup': {
      return `${postfixBase(expression.base)}?${printKey(expression.key)}`;
    }
    case 'unary-lookup': {
      return `?${printKey(expression.key)}`;
    }
    case 'filter': {
      return `${postfixBase(expression.base)}[${printXPath(expression.predicate)}]`;
    }
    case 'dynamic-call': {
      return `${postfixBase(expression.function)}${printArguments(expression.arguments)}`;
    }
    case 'path': {
      return printPath(expression.steps);
    }
    case 'axis-step': {
      return printStep(expression);
    }
    case 'logical':
    case 'comparison':
    case 'arithmetic':
    case 'set-operation': {
      return `${operand(expression.left)} ${expression.operator} ${operand(expression.right)}`;
    }
    case 'string-concatenation':
    case 'range':
    case 'simple-map': {
      return `${operand(expression.left)} ${OPERATION_SYMBOLS[expression.kind]} ${operand(expression.right)}`;
    }
    case 'unary': {
      return `${expression.operator}${operand(expression.operand)}`;
    }
    case 'instance-of': {
      return `${operand(expression.operand)} instance of ${printSequenceType(expression.type)}`;
    }
    case 'treat-as': {
      return `${operand(expression.operand)} treat as ${printSequenceType(expression.type)}`;
    }
    case 'castable-as': {
      return `${operand(expression.operand)} castable as ${printSingleType(expression.type)}`;
    }
    case 'cast-as': {
      return `${operand(expression.operand)} cast as ${printSingleType(expression.type)}`;
    }
    case 'static-arrow': {
      return `${operand(expression.operand)} => ${printName(expression.name)}${printArguments(expression.arguments)}`;
    }
    case 'dynamic-arrow': {
      return `${operand(expression.operand)} => (${printXPath(expression.function)})${printArguments(expression.arguments)}`;
    }
    case 'for': {
      return `for ${printBindings(expression.bindings, 'in')} return ${operand(expression.body)}`;
    }
    case 'let': {
      return `let ${printBindings(expression.bindings, ':=')} return ${operand(expression.body)}`;
    }
    case 'quantified': {
      return `${expression.quantifier} ${printBindings(expression.bindings, 'in')} satisfies ${operand(expression.condition)}`;
    }
    default: {
      const { condition, thenExpression, elseExpression } = expression;
      return `if (${printXPath(condition)}) then ${operand(thenExpression)} else ${operand(elseExpression)}`;
    }
  }
}
