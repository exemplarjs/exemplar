import type { ResolvedSource, URIResolver } from '@exemplarjs/xml';
import { type EvaluationOptions, XPathCompiler, XPathException } from '@/index';

/** A resource a test resolver supplies: text, or a resolved source as it is. */
type Resource = string | ResolvedSource;

/** A URI resolver over resources by absolute URI, answering at once, or with a promise when `promised`; it records each URI asked for. */
export function resolverOf(
  resources: Readonly<Record<string, Resource>>,
  promised = false
): URIResolver & { readonly asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    resolve(href) {
      asked.push(href);
      const resource = resources[href];
      const source = typeof resource === 'string' ? { text: resource } : resource;
      return promised ? Promise.resolve(source) : source;
    },
  };
}

/** Evaluation options that read resources through a resolver. */
export function readingWith(uriResolver: URIResolver): EvaluationOptions {
  return { resources: { uriResolver } };
}

/** The documents the pausing tests read, by absolute URI. */
export const PAUSING_DOCUMENTS: Readonly<Record<string, string>> = {
  'u:a.xml': '<a><n>1</n><n>2</n></a>',
  'u:b.xml': '<b>3</b>',
  'u:1.xml': '<x>1</x>',
  'u:2.xml': '<x>2</x>',
};

/** An expression's items as strings, evaluated with a resolver that answers at once and with one that answers with a promise. */
export async function stringsBothWays(
  expression: string,
  resources: Readonly<Record<string, Resource>> = PAUSING_DOCUMENTS
): Promise<[string[], string[]]> {
  const executable = new XPathCompiler().compile(expression);
  return [
    executable.evaluateStrings(null, readingWith(resolverOf(resources))),
    await executable.evaluateStringsAsync(null, readingWith(resolverOf(resources, true))),
  ];
}

/** The code of the error an expression raises when evaluated with a resolver that answers with a promise. */
export async function asyncErrorCode(
  expression: string,
  resources: Readonly<Record<string, Resource>> = PAUSING_DOCUMENTS
): Promise<string | undefined> {
  try {
    await new XPathCompiler().compile(expression).evaluateAsync(null, readingWith(resolverOf(resources, true)));
  } catch (error) {
    return error instanceof XPathException ? error.code : undefined;
  }
  return undefined;
}
