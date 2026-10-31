'use strict';

// No browser globals are patched. Each factory is loaded into a fresh VM and
// exercised through its public controls, context(), restore(), and scene().
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const plain = value => JSON.parse(JSON.stringify(value));
let assertions = 0;
function equal(actual, expected, message) { assertions++; assert.deepEqual(plain(actual), expected, message); }
function ok(value, message) { assertions++; assert.ok(value, message); }
function near(actual, expected, message) { ok(Math.abs(actual - expected) < 1e-10, message); }
class Element {
  constructor() { this.value = ''; this.textContent = ''; this.attributes = {}; this.listeners = {}; this.children = []; }
  addEventListener(name, listener) { this.listeners[name] = listener; }
  setAttribute(name, value) { this.attributes[name] = value; }
  removeAttribute(name) { delete this.attributes[name]; }
  replaceChildren(...children) { this.children = children; }
  emit(name) { this.listeners[name](); }
}
function factory(name, initial) {
  const elements = {};
  const matrixInputs = Array.from({ length: 9 }, () => new Element());
  const vectorInputs = Array.from({ length: 3 }, () => new Element());
  const container = {
    querySelector(selector) { return elements[selector] ||= new Element(); },
    querySelectorAll(selector) { return selector === '[data-matrix-entry]' ? matrixInputs : vectorInputs; }
  };
  const scope = { window: {}, document: { createElement: () => new Element() } };
  vm.createContext(scope);
  vm.runInContext(fs.readFileSync(path.join(__dirname, name + '.js'), 'utf8'), scope);
  let changes = 0;
  const api = scope.window.MathLabScenes[name](container, initial, () => changes++);
  return { api, elements, matrixInputs, vectorInputs, changes: () => changes };
}
function finiteScene(scene) {
  const points = [
    ...scene.bounds,
    ...(scene.lines || []).flatMap(item => item.points),
    ...(scene.faces || []).flatMap(item => item.points),
    ...(scene.dots || []).map(item => item.point),
    ...(scene.labels || []).map(item => item.point)
  ];
  ok(points.every(point => point.length === 3 && [0, 1, 2].every(axis => Number.isFinite(point[axis]))), 'Every scene point is finite');
  const low = [0, 1, 2].map(axis => Math.min(...scene.bounds.map(point => point[axis])));
  const high = [0, 1, 2].map(axis => Math.max(...scene.bounds.map(point => point[axis])));
  ok(points.every(point => point.every((value, axis) => value >= low[axis] && value <= high[axis])), 'Bounds contain rendered points');
}

const matrix = factory('matrix', { matrix: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], vector: [1, 2, -1] });
const presets = [
  ['identity', [1, 2, -1], 1, 'preserved'],
  ['rotation', [-Math.SQRT1_2, 3 * Math.SQRT1_2, -1], 1, 'preserved'],
  ['shear', [2.2, 1.7, -1], 1, 'preserved'],
  ['flatten', [1, 2, 0], 0, 'collapsed'],
  ['reflection', [-1, 2, -1], -1, 'reversed']
];
for (const [preset, product, det, orientation] of presets) {
  const select = matrix.elements['[data-matrix-preset]'];
  select.value = preset;
  select.emit('change');
  const context = matrix.api.context();
  context.transformedVector.forEach((value, index) => near(value, product[index], preset + ' Av'));
  near(context.determinant, det, preset + ' determinant');
  equal(context.orientation, orientation, preset + ' orientation');
  equal(context.vector, [1, 2, -1], 'Presets retain the user vector');
  finiteScene(matrix.api.scene());
}
matrix.api.restore({ matrix: [[1, 2, 0], [0, 1, 0], [0, 0, -2]], vector: [2, -1, 3] });
equal(matrix.api.context().transformedVector, [0, -1, -6], 'Custom matrix product');
equal(matrix.api.context().determinant, -2, 'Custom matrix determinant');
matrix.matrixInputs[0].value = '1.2500';
matrix.matrixInputs[0].emit('input');
equal(matrix.api.context().matrix[0][0], 1.25, 'Direct editing changes state');
equal(matrix.matrixInputs[0].value, '1.2500', 'Valid typing is not reformatted or replaced');
equal(matrix.elements['[data-matrix-preset]'].value, 'custom', 'Direct editing marks custom');
const previous = plain(matrix.api.context());
const priorChanges = matrix.changes();
for (const value of ['', 'NaN', 'Infinity', '-3.01', '3.01']) {
  matrix.matrixInputs[0].value = value;
  matrix.matrixInputs[0].emit('input');
  equal(matrix.api.context(), previous, 'Invalid input retains last valid state');
  equal(matrix.changes(), priorChanges, 'Invalid input does not publish a new state');
  equal(matrix.matrixInputs[0].attributes['aria-invalid'], 'true', 'Invalid field is identified');
  ok(matrix.elements['[data-matrix-error]'].textContent.includes('第 1 行第 1 列'), 'Error identifies the field');
}
matrix.matrixInputs[0].value = '-3';
matrix.matrixInputs[0].emit('input');
equal(matrix.elements['[data-matrix-error]'].textContent, '', 'Valid correction clears error');
equal(matrix.api.context().matrix[0][0], -3, 'Minimum boundary is accepted');
matrix.api.restore({ matrix: [[3, 3, 3], [3, 3, 3], [3, 3, 3]], vector: [3, 3, 3] });
equal(matrix.api.context().transformedVector, [27, 27, 27], 'Large valid product is not clipped');
finiteScene(matrix.api.scene());
for (const invalid of [null, {}, { matrix: Array(3), vector: [1, 1, 1] }, { matrix: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], vector: [NaN, 0, 0] }]) {
  matrix.api.restore(invalid);
  equal(matrix.api.context().preset, 'shear', 'Invalid restore selects safe default');
  finiteScene(matrix.api.scene());
}

const counts = { SC: [8, 27], BCC: [9, 35], FCC: [14, 63] };
const effective = { SC: 1, BCC: 2, FCC: 4 };
for (const type of ['SC', 'BCC', 'FCC']) {
  for (const repeat of [1, 2]) {
    const crystal = factory('crystal', { type, repeat, plane: 'none' });
    const context = crystal.api.context();
    const scene = crystal.api.scene();
    equal(context.visiblePointCount, counts[type][repeat - 1], 'Correct closed-block screen count');
    equal(context.effectivePointsPerConventionalCell, effective[type], 'Correct conventional cell count');
    equal(context.effectivePointsInBlock, effective[type] * repeat ** 3, 'Correct supercell occupancy');
    equal(new Set(scene.dots.map(dot => dot.point.join(','))).size, scene.dots.length, 'Shared boundary points are deduplicated');
    const sharedCount = scene.dots.reduce((sum, dot) => sum + 2 ** -dot.point.filter(value => value === 0 || value === repeat).length, 0);
    equal(sharedCount, effective[type] * repeat ** 3, 'Boundary-weighted closed block equals occupancy');
    finiteScene(scene);
    for (const plane of ['100', '110', '111']) {
      crystal.api.restore({ type, repeat, plane });
      const indices = plane.split('').map(Number);
      const planeScene = crystal.api.scene();
      equal(planeScene.faces.length, 1, 'Exactly one representative plane');
      planeScene.faces[0].points.forEach(point => equal(point.reduce((sum, value, axis) => sum + value * indices[axis], 0), 1, 'Representative vertex satisfies hx+ky+lz=1'));
      finiteScene(planeScene);
    }
  }
}
const bcc = factory('crystal', { type: 'BCC', selection: '0.5,0.5,0.5' });
equal(bcc.api.context().fractionalCoordinates, [0.5, 0.5, 0.5], 'BCC body-centre coordinates');
const fcc = factory('crystal', { type: 'FCC', selection: '0,0.5,0.5' });
equal(fcc.api.context().fractionalCoordinates, [0, 0.5, 0.5], 'FCC face-centre coordinates');
equal(fcc.api.scene().dots.filter(dot => dot.point.includes(0.5)).length, 6, 'All six conventional FCC face centres');
const selectPoint = fcc.elements['[data-crystal="selection"]'];
selectPoint.value = '0.5,1,0.5';
selectPoint.emit('change');
equal(fcc.api.context().fractionalCoordinates, [0.5, 1, 0.5], 'Point control updates coordinates');
equal(fcc.changes(), 1, 'Point control publishes a change');
for (const invalid of [null, { type: 'unknown', repeat: 100, plane: '<script>', selection: 'NaN,0,0' }, { plane: 100 }]) {
  fcc.api.restore(invalid);
  equal(fcc.api.context().plane, '110', 'Invalid plane restores to the documented default');
  equal(fcc.api.scene().faces.length, 1, 'Restored plane context matches scene');
  finiteScene(fcc.api.scene());
}
console.log('PASS: ' + assertions + ' matrix/crystal assertions; presets, edits, validation, finite bounds, centring, counts, deduplication, and plane equations.');
