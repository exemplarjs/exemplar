import {
  atomicArithmetic,
  EMPTY_SEQUENCE,
  isNumericType,
  numericNegate,
  type XdmAtomicValue,
  type XdmValue,
} from '@exemplarjs/xdm';
import { dynamicError, XPathErrorCode } from '@/api/xpath-exception';
import { atomizeOptional, untypedAsDouble } from '@/runtime/atomization';
import type { Evaluator } from '@/runtime/dynamic-context';
import type { Arithmetic, UnaryExpression } from '@/syntax/syntax-tree';
import { compile, type CompileState } from './compiler.ts';

/** An arithmetic operand: atomized to one value, an untyped value cast to a double; undefined when empty. */
function operandOf(value: XdmValue, what: string): XdmAtomicValue | undefined {
  const atomic = atomizeOptional(value, what);
  return atomic === undefined ? undefined : untypedAsDouble(atomic);
}

/** The operand of unary `-` or `+`: a number, else XPTY0004. */
function numericOperand(value: XdmValue, what: string): XdmAtomicValue | undefined {
  const number = operandOf(value, what);
  if (number !== undefined && !isNumericType(number.type))
    return dynamicError(
      XPathErrorCode.TYPE_MISMATCH,
      `${what} must be a number, not a value of type ${number.type.toString()}`
    );
  return number;
}

/** `a + b`, `a - b`, `a * b`, `a div b`, `a idiv b`, `a mod b`: empty when either operand is. */
export function compileArithmetic(arithmetic: Arithmetic, state: CompileState): Evaluator {
  const left = compile(arithmetic.left, state);
  const right = compile(arithmetic.right, state);
  const operator = arithmetic.operator;
  const what = `Each operand of ${operator}`;
  return (context) => {
    const first = operandOf(left(context), what);
    if (first === undefined) return EMPTY_SEQUENCE;
    const second = operandOf(right(context), what);
    if (second === undefined) return EMPTY_SEQUENCE;
    return [atomicArithmetic(operator, first, second, context.environment.implicitTimezone)];
  };
}

/** `-a` and `+a`. */
export function compileUnary(unary: UnaryExpression, state: CompileState): Evaluator {
  const operand = compile(unary.operand, state);
  const negate = unary.operator === '-';
  const what = `The operand of unary ${unary.operator}`;
  return (context) => {
    const number = numericOperand(operand(context), what);
    if (number === undefined) return EMPTY_SEQUENCE;
    return [negate ? numericNegate(number) : number];
  };
}
