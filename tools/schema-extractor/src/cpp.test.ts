/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it } from 'vitest';
import {
  conditionsByLine,
  dispatchedKeys,
  findFunctions,
  lineAt,
  matchBrace,
  requiredFeature,
  stringConstants,
  stripComments,
} from './cpp';

describe('stripComments', () => {
  it('blanks line and block comments but keeps strings and newlines', () => {
    const src = 'a // x\nb /* y\nz */ c "/* no */" \'/\' "e\\"s"';
    const out = stripComments(src);
    expect(out.split('\n').length).toBe(3);
    expect(out).toContain('"/* no */"');
    expect(out).toContain('"e\\"s"');
    expect(out).not.toContain('x');
    expect(out).not.toContain('y');
    expect(out.length).toBe(src.length);
  });
  it('handles unterminated comments and strings', () => {
    expect(stripComments('a /* open')).toBe('a        ');
    expect(stripComments('"abc')).toBe('"abc');
  });
});

describe('lineAt / conditionsByLine / requiredFeature', () => {
  it('computes 1-based lines', () => {
    expect(lineAt('a\nb\nc', 0)).toBe(1);
    expect(lineAt('a\nb\nc', 4)).toBe(3);
  });
  it('tracks #if/#ifdef/#ifndef/#elif/#else/#endif and drops header guards', () => {
    const src = [
      '#ifndef X_H', // 1
      '#define X_H', // 2
      '#if (FEATURE_A == 1)', // 3
      'a', // 4
      '#elif defined(B)', // 5
      'b', // 6
      '#else', // 7
      'c', // 8
      '#endif', // 9
      '#ifdef FEATURE_C', // 10
      'd', // 11
      '#endif', // 12
      '#endif', // 13
    ].join('\n');
    const c = conditionsByLine(src);
    expect(c[2]).toEqual([]);
    expect(c[4]).toEqual(['(FEATURE_A == 1)']);
    expect(c[6]).toEqual(['!((FEATURE_A == 1)) && defined(B)']);
    expect(c[8]).toEqual(['!(!((FEATURE_A == 1)) && defined(B))']);
    expect(c[9]).toEqual([]);
    expect(c[11]).toEqual(['defined(FEATURE_C)']);
    expect(requiredFeature(c[4]!)).toBe('FEATURE_A');
    expect(requiredFeature(c[11]!)).toBe('FEATURE_C');
    expect(requiredFeature(c[8]!)).toBeUndefined();
    expect(requiredFeature(['ENABLE_X'])).toBeUndefined();
  });
});

describe('findFunctions / matchBrace / dispatchedKeys', () => {
  const src = `void A::F(int x) const
{
    Call(A::F(1));
    switch (attrKeyId) {
        case K_ONE: {
            switch (v) { case K_INNER: break; }
            break;
        }
        case K_TWO: break;
    }
    if (eventTypeId == K_THREE || keyId != K_UNKNOWN) {}
}
int A::F(1);
`;
  it('finds definitions, not calls', () => {
    const fns = findFunctions(src, 'A', 'F');
    expect(fns).toHaveLength(1);
    expect(fns[0]!.line).toBe(1);
    expect(src[fns[0]!.close]).toBe('}');
    expect(matchBrace('{ { } ', 0)).toBe(5);
  });
  it('collects outermost switch cases and key comparisons', () => {
    const [fn] = findFunctions(src, 'A', 'F');
    expect(dispatchedKeys(src, fn!).map((k) => k.enumName)).toEqual(['K_ONE', 'K_TWO', 'K_THREE']);
  });
  it('strict mode only counts switches over key variables', () => {
    const s =
      'void B::G() {\n switch (valueId) { case K_X: break; }\n switch (stylePropNameId) { case K_Y: break; }\n}';
    const [fn] = findFunctions(s, 'B', 'G');
    expect(dispatchedKeys(s, fn!, true).map((k) => k.enumName)).toEqual(['K_Y']);
    expect(dispatchedKeys(s, fn!).map((k) => k.enumName)).toEqual(['K_X', 'K_Y']);
  });
});

describe('stringConstants', () => {
  it('reads class constants and char arrays', () => {
    const m = stringConstants('const char * const X::FUNC_A = "a";\nconstexpr char NAME[] = "b";');
    expect(m.get('FUNC_A')).toBe('a');
    expect(m.get('NAME')).toBe('b');
  });
});
