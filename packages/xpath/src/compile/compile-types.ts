import { XdmError, type XdmValue, XS_NAMESPACE } from '@exemplarjs/xdm';
import { ErrorFactory } from '@exemplarjs/xml/internal';
import { dynamicError, XPathErrorCode, XPathException } from '@/api/xpath-exception';
import { booleanResult } from '@/runtime/boolean-value';
import { castOptions, type CastTarget, castValue, constructorCast, LIST_TYPES } from '@/runtime/casts';
import type { Evaluator } from '@/runtime/dynamic-context';
import { resolveElementName } from '@/static/name-resolution';
import { compileSequenceType, resolveAtomicType } from '@/static/type-resolution';
import type { CastableAs, CastAs, Expression, InstanceOf, SingleType, TreatAs } from '@/syntax/syntax-tree';
import { compile, type CompileState, staticError } from './compiler.ts';

/** The types a cast cannot target, as no value is of them alone. */
const ABSTRACT_TARGETS = new Set(['anyAtomicType', 'NOTATION', 'anySimpleType']);

/** Compiles `instance of`, `treat as`, `castable as` or `cast as`. */
export function compileTypeExpression(
  expression: InstanceOf | TreatAs | CastableAs | CastAs,
  state: CompileState
): Evaluator {
  const operand = compile(expression.operand, state);
  if (expression.kind === 'instance-of' || expression.kind === 'treat-as') {
    const type = compileSequenceType(expression.type, state.context);
    if (expression.kind === 'instance-of') return (context) => booleanResult(type.matches(operand(context)));
    return (context) => {
      const value = operand(context);
      if (!type.matches(value))
        return dynamicError(XPathErrorCode.TREAT_MISMATCH, `The value is not an instance of ${type.text}`);
      return value;
    };
  }
  const cast = compileCast(expression.type, state);
  if (expression.kind === 'cast-as') return castOf(expression.operand, operand, cast);
  return (context) => {
    const value = operand(context);
    return booleanResult(castable(() => cast(value)));
  };
}

/** Whether a cast succeeds; its own errors count as failure, while the operand's, raised before, pass on. */
function castable(cast: () => XdmValue): boolean {
  try {
    cast();
    return true;
  } catch (error) {
    ErrorFactory.expect(error, XdmError, XPathException);
    return false;
  }
}

/** The target of a cast; XPST0080 for an abstract type. */
function castTarget(type: SingleType, state: CompileState): CastTarget {
  const resolved = resolveElementName(type.name, state.context);
  if (resolved.namespaceURI === XS_NAMESPACE) {
    if (ABSTRACT_TARGETS.has(resolved.localName))
      staticError(
        state,
        XPathErrorCode.CAST_TO_ABSTRACT_TYPE,
        `Nothing can be cast to the abstract type xs:${resolved.localName}`,
        type
      );
    const listOf = LIST_TYPES[resolved.localName];
    if (listOf !== undefined) return { listOf };
  }
  return resolveAtomicType(type.name, state.context).type;
}

/** Compiles a cast to a single type into a function of the operand's value. */
function compileCast(type: SingleType, state: CompileState): (value: XdmValue) => XdmValue {
  const target = castTarget(type, state);
  const options = castOptions(state.context);
  const allowsEmpty = type.allowsEmpty;
  return (value) => castValue(value, target, options, allowsEmpty);
}

/** A cast of an operand; of a literal, cast once here, unless that fails, when the error is raised on evaluation. */
function castOf(operand: Expression, evaluator: Evaluator, cast: (value: XdmValue) => XdmValue): Evaluator {
  if (operand.kind === 'literal') {
    try {
      const value = cast([operand.value]);
      return () => value;
    } catch (error) {
      ErrorFactory.expect(error, XdmError, XPathException);
    }
  }
  return (context) => cast(evaluator(context));
}

/** Compiles a constructor function call, `xs:integer($a)`, as the cast `$a cast as xs:integer?`. */
export function compileConstructorCall(target: CastTarget, argument: Expression, state: CompileState): Evaluator {
  return castOf(argument, compile(argument, state), constructorCast(target, castOptions(state.context)));
}
