/*
 * Copyright (c) 2026 ohos-lite-js-ide contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it } from 'vitest';
import { extractViewModel } from './viewmodel';

describe('extractViewModel', () => {
  it('ES5.1 page: data object, function-valued methods and lifecycle hooks', () => {
    const vm = extractViewModel(`import router from '@system.router';
export default {
  data: { title: 'x', 'list': [], count: 0 },
  onInit: function () { this.title = 'y'; },
  onShow: function () {},
  tap: function (e) { router.replace({ uri: 'pages/b/b' }); },
  'swiped': function () {},
  constant: 3
};`);
    expect(vm).toEqual({
      data: ['title', 'list', 'count'],
      computed: [],
      props: [],
      methods: ['tap', 'swiped'],
      lifecycle: ['onInit', 'onShow'],
    });
  });
  it('data as a function, computed, props array/object, shorthand methods', () => {
    const vm = extractViewModel(`export default {
  props: ['a', 1, 'b'],
  data() { var x = 1; return { p: 1, q: 2 }; },
  computed: { total: function () { return 1; } },
  go() {},
  arrow: () => 1,
  [dynamic]: function () {}
};`);
    expect(vm).toMatchObject({
      props: ['a', 'b'],
      data: ['p', 'q'],
      computed: ['total'],
      methods: ['go', 'arrow'],
    });
    expect(extractViewModel('export default { props: { c: {} }, data: () => ({ z: 1 }) }')).toMatchObject({
      props: ['c'],
      data: ['z'],
    });
    expect(extractViewModel('export default { data: function () { console.log(1); } }').data).toEqual([]);
    expect(extractViewModel('export default { data: function () { return; } }').data).toEqual([]);
  });
  it('follows `var vm = {…}; export default vm` and module.exports', () => {
    expect(
      extractViewModel('var vm = { data: { a: 1 }, f: function () {} }; export default vm;'),
    ).toMatchObject({ data: ['a'], methods: ['f'] });
    expect(extractViewModel('module.exports = { g: function () {} };').methods).toEqual(['g']);
    expect(extractViewModel('export default missing;').methods).toEqual([]);
    expect(extractViewModel('var a = 1, b; export default b;').methods).toEqual([]);
    expect(extractViewModel('foo.exports = { g: function () {} }; x = 1;').methods).toEqual([]);
  });
  it('tolerates half-typed code and non-object exports', () => {
    expect(extractViewModel('export default {\n  data: { a: 1, b: },\n  tap: function () {\n').data).toEqual(
      expect.arrayContaining(['a']),
    );
    expect(extractViewModel('export default function () {}').methods).toEqual([]);
    expect(extractViewModel('').data).toEqual([]);
    expect(extractViewModel('export default { data: 5, computed: 1 }')).toMatchObject({
      data: [],
      computed: [],
    });
  });
});
