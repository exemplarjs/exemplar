import type { FunctionGroup } from '@/functions/function-group';
import { HIGHER_ORDER_FUNCTIONS } from '@/functions/higher-order/higher-order-functions';
import { RANDOM_FUNCTIONS } from '@/functions/higher-order/random-number-generator';

/** The higher-order functions, such as `for-each`, `filter`, `fold-left` and `sort`, and `random-number-generator`. */
export const higherOrderFunctions: FunctionGroup = {
  name: 'higher-order',
  functions: [...HIGHER_ORDER_FUNCTIONS, ...RANDOM_FUNCTIONS],
};
