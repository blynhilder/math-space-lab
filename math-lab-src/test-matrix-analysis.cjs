'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const plain = value => JSON.parse(JSON.stringify(value));

function matrixLab(matrix, vector = [1, 2, 3]) {
  const element = () => ({
    value: '', textContent: '', listeners: {},
    addEventListener(type, handler) { this.listeners[type] = handler; },
    setAttribute() {}, removeAttribute() {}
  });
  const fields = new Map();
  const matrixInputs = Array.from({ length: 9 }, element);
  const vectorInputs = Array.from({ length: 3 }, element);
  const container = {
    querySelector(selector) {
      if (!fields.has(selector)) fields.set(selector, element());
      return fields.get(selector);
    },
    querySelectorAll(selector) { return selector === '[data-matrix-entry]' ? matrixInputs : vectorInputs; }
  };
  const scope = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'matrix.js'), 'utf8'), scope);
  const api = scope.window.MathLabScenes.matrix(container, { matrix, vector });
  return { api, fields, matrixInputs };
}

const cases = [
  ['zero', [[0, 0, 0], [0, 0, 0], [0, 0, 0]], 0, 0],
  ['rank one', [[1, 2, 3], [0.5, 1, 1.5], [-1, -2, -3]], 1, -1],
  ['rank two', [[1, 2, 0], [0, 1, 1], [1, 3, 1]], 2, 3],
  ['rank three', [[1, 2, 0], [0, 1, 1], [1, 3, 2]], 3, 4],
  ['floating point dependent rows', [[0.1, 0.2, 0.3], [0.2, 0.4, 0.6], [0, 1, 0]], 2, 0.5],
  ['small full-rank diagonal', [[1e-200, 0, 0], [0, 2e-200, 0], [0, 0, 3e-200]], 3, 6e-200],
  ['small dependent rows', [[1e-200, 2e-200, 3e-200], [2e-200, 4e-200, 6e-200], [0, 1e-200, 0]], 2, 5e-200],
  ['subnormal identity', [[1e-320, 0, 0], [0, 1e-320, 0], [0, 0, 1e-320]], 3, 3e-320]
];
for (const [name, matrix, rank, trace] of cases) test(name + ': rank, trace and invertibility', () => {
  const { api, fields } = matrixLab(matrix);
  const result = api.context();
  assert.equal(result.rank, rank);
  assert.equal(result.invertible, rank === 3);
  assert.ok(Math.abs(result.trace - trace) <= Math.abs(trace) * 1e-14 || result.trace === trace);
  assert.equal(result.rankRelativeTolerance, 1e-12);
  assert.equal(result.rankScale, Math.max(...matrix.flat().map(Math.abs)));
  assert.match(result.rankInterpretation, /数值|阈值/);
  assert.match(fields.get('[data-matrix-rank]').textContent, new RegExp(String(rank)));
  assert.equal(fields.get('[data-matrix-invertible]').textContent.includes('可逆（'), rank === 3);
  const serialized = JSON.stringify(result);
  assert.ok(serialized.length < 3000, 'Derived metadata remains compact');
});

test('rank is invariant under uniform scaling; near dependence remains approximate', () => {
  const matrix = [[1, 0, 0], [0, 1, 0], [0, 0, 1e-14]];
  for (const scale of [1, 1e-100, 1e-250]) {
    const result = matrixLab(matrix.map(row => row.map(value => value * scale))).api.context();
    assert.equal(result.rank, 2);
    assert.equal(result.invertible, false);
    assert.notEqual(result.determinant, undefined);
    assert.match(result.rankInterpretation, /近奇异|精确/);
  }
});

test('orientation stays meaningful for full rank when the direct determinant rounds to zero', () => {
  const positive = matrixLab([[1e-200, 0, 0], [0, 2e-200, 0], [0, 0, 3e-200]]);
  const negative = matrixLab([[0, 1e-200, 0], [1e-200, 0, 0], [0, 0, 1e-200]]);
  assert.equal(positive.api.context().determinant, 0);
  assert.equal(positive.api.context().orientation, 'preserved');
  assert.equal(negative.api.context().orientation, 'reversed');
  assert.match(positive.fields.get('[data-matrix-det]').textContent, /精度/);
  assert.equal(positive.api.context().determinantPrecisionLimited, true);
});

test('determinant cancellation is not labelled specifically as underflow', () => {
  const matrix = [
    [0.999999996, 0.99999999, 0.999999996],
    [1.000000006, 0.99999999, 1.000000009],
    [1.000000001, 1.000000002, 1.000000004]
  ];
  const { api, fields } = matrixLab(matrix);
  assert.equal(api.context().determinant, 0, 'Direct 3x3 expansion loses the small determinant by cancellation');
  assert.equal(api.context().rank, 3, 'Independent normalized pivots remain above the relative threshold');
  assert.equal(api.context().invertible, true);
  assert.match(fields.get('[data-matrix-det]').textContent, /精度/);
  assert.doesNotMatch(fields.get('[data-matrix-det]').textContent, /下溢/);
  assert.equal(api.context().determinantPrecisionLimited, true);
});

test('a custom near-singular matrix with rounded zero determinant is not declared exactly collapsed', () => {
  const { api, fields } = matrixLab([[1e-200, 0, 0], [0, 1e-200, 0], [0, 0, 1e-215]]);
  assert.equal(api.context().determinant, 0);
  assert.equal(api.context().rank, 2);
  assert.match(fields.get('[data-matrix-orientation]').textContent, /数值|近/);
  assert.doesNotMatch(fields.get('[data-matrix-orientation]').textContent, /体积为 0/);
  assert.match(fields.get('[data-matrix-volume]').textContent, /精度/);
});

test('known singular presets retain a clear exact collapse explanation', () => {
  const { fields } = matrixLab([[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
  const select = fields.get('[data-matrix-preset]');
  for (const preset of ['flatten', 'lineProjection']) {
    select.value = preset; select.listeners.change();
    assert.equal(fields.get('[data-matrix-orientation]').textContent, '体积为 0 · 降维');
    assert.equal(fields.get('[data-matrix-volume]').textContent, '0');
  }
});

test('scaling preset is full rank and preserves the selected vector', () => {
  const { api, fields } = matrixLab([[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
  const select = fields.get('[data-matrix-preset]');
  select.value = 'scaling'; select.listeners.change();
  const result = api.context();
  assert.deepEqual(plain(result.vector), [1, 2, 3]);
  assert.deepEqual(plain(result.transformedVector), [2, 2, 1.5]);
  assert.equal(result.rank, 3);
  assert.equal(result.trace, 3.5);
  assert.equal(result.determinant, 1);
});

test('line projection has rank one, lands on the line, and is idempotent', () => {
  const { api, fields } = matrixLab([[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
  const select = fields.get('[data-matrix-preset]');
  select.value = 'lineProjection'; select.listeners.change();
  const result = api.context();
  assert.equal(result.rank, 1);
  assert.equal(result.trace, 1);
  assert.equal(result.determinant, 0);
  assert.deepEqual(plain(result.transformedVector), [1.5, 1.5, 0]);
  api.restore({ matrix: result.matrix, vector: result.transformedVector });
  assert.deepEqual(plain(api.context().transformedVector), [1.5, 1.5, 0]);
  assert.equal(api.context().preset, 'lineProjection');
  assert.ok(api.scene().bounds.every(point => point.every(Number.isFinite)));
});
