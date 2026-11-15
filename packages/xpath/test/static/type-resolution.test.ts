import { describe, expect, it } from 'vitest';
import { LIBRARY, strings } from '../helpers/evaluate.ts';

describe('compileItemType', () => {
  it('matches nodes only against node tests', () => {
    expect(
      strings('map {} instance of node(), 1 instance of element(), //book[1] instance of element()', LIBRARY)
    ).toEqual(['false', 'false', 'true']);
    expect(
      strings('//book[1] instance of document-node(element(book)), (/) instance of document-node()', LIBRARY)
    ).toEqual(['false', 'true']);
  });

  it('matches function items against function tests by arity and signature', () => {
    expect(
      strings(
        'abs#1 instance of function(*), 1 instance of function(*), abs#1 instance of function(xs:integer, xs:integer) as item()*'
      )
    ).toEqual(['true', 'false', 'false']);
    expect(
      strings(
        'function($a as xs:decimal) as xs:integer {1} instance of function(xs:integer) as xs:decimal, ' +
          'function($a as xs:integer) {1} instance of function(xs:decimal) as item()*'
      )
    ).toEqual(['true', 'false']);
  });

  it('matches maps against function tests by their entries', () => {
    expect(
      strings(
        "map { 1: 'A', 'x': 'B' } instance of function(xs:integer) as xs:string?, " +
          "map { 1: 'A' } instance of function(xs:integer) as xs:string, " +
          'map { 1: 1 } instance of function(xs:integer) as xs:string?, ' +
          'map {} instance of function(item()) as item()*, ' +
          'map {} instance of function(xs:integer, xs:integer) as item()*'
      )
    ).toEqual(['true', 'false', 'false', 'false', 'false']);
  });

  it('matches arrays against function tests by their members', () => {
    expect(
      strings(
        "[['A'], ['B']] instance of function(xs:integer) as item()*, [1, 2] instance of function(xs:integer) as xs:integer, " +
          "[1, 'a'] instance of function(xs:integer) as xs:integer, [1] instance of function(xs:string) as item()*"
      )
    ).toEqual(['true', 'true', 'false', 'false']);
  });

  it('matches maps against map tests by their keys and values', () => {
    expect(
      strings(
        "map { 'a': 1 } instance of map(*), [1] instance of map(*), map { 'a': 1 } instance of map(xs:string, xs:integer), " +
          "map { 1: 1 } instance of map(xs:string, xs:integer), map { 'a': 'b' } instance of map(xs:string, xs:integer), " +
          '[1] instance of map(xs:integer, item()*)'
      )
    ).toEqual(['true', 'false', 'true', 'false', 'false', 'false']);
  });

  it('matches arrays against array tests by their members', () => {
    expect(
      strings(
        '[1, 2] instance of array(*), map {} instance of array(*), [1, 2] instance of array(xs:integer), ' +
          "[1, 'a'] instance of array(xs:integer), map {} instance of array(xs:integer), [(1, 2)] instance of array(xs:integer+)"
      )
    ).toEqual(['true', 'false', 'true', 'false', 'false', 'true']);
  });
});
