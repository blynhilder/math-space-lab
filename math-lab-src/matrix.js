(function () {
  'use strict';
  window.MathLabScenes = window.MathLabScenes || {};
  window.MathLabScenes.matrix = function (container, initialState, onChange) {
    const q = (selector) => container.querySelector(selector);
    const matrixInputs = Array.from(container.querySelectorAll('[data-matrix-entry]'));
    const vectorInputs = Array.from(container.querySelectorAll('[data-matrix-vector]'));
    const presetInput = q('[data-matrix-preset]');
    const errorOutput = q('[data-matrix-error]');
    const productOutput = q('[data-matrix-product]');
    const detOutput = q('[data-matrix-det]');
    const volumeOutput = q('[data-matrix-volume]');
    const orientationOutput = q('[data-matrix-orientation]');
    const traceOutput = q('[data-matrix-trace]');
    const rankOutput = q('[data-matrix-rank]');
    const invertibleOutput = q('[data-matrix-invertible]');
    const rankRelativeTolerance = 1e-12;
    const rankInterpretation = '数值秩：按最大元素绝对值归一化，全主元消元阈值为 1e-12；近奇异判断不代替精确证明。';
    const rootHalf = Math.SQRT1_2;
    const presets = {
      identity: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
      rotation: [[rootHalf, -rootHalf, 0], [rootHalf, rootHalf, 0], [0, 0, 1]],
      shear: [[1, 0.6, 0], [0, 1, 0.3], [0, 0, 1]],
      scaling: [[2, 0, 0], [0, 1, 0], [0, 0, 0.5]],
      flatten: [[1, 0, 0], [0, 1, 0], [0, 0, 0]],
      lineProjection: [[0.5, 0.5, 0], [0.5, 0.5, 0], [0, 0, 0]],
      reflection: [[-1, 0, 0], [0, 1, 0], [0, 0, 1]]
    };
    const presetNames = { identity: '恒等', rotation: '旋转', shear: '剪切', scaling: '缩放', flatten: '压扁', lineProjection: '直线投影', reflection: '反射', custom: '自定义' };
    const copyMatrix = (matrix) => matrix.map((row) => row.slice());
    const validNumber = (value) => typeof value === 'number' && Number.isFinite(value) && value >= -3 && value <= 3;
    const validVector = (value) => Array.isArray(value) && value.length === 3 && [0, 1, 2].every(index => validNumber(value[index]));
    const validMatrix = (value) => Array.isArray(value) && value.length === 3 && [0, 1, 2].every(index => validVector(value[index]));
    const multiply = (matrix, vector) => matrix.map((row) => row.reduce((sum, value, index) => sum + value * vector[index], 0));
    const determinant = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    const format = (value) => {
      if (Object.is(value, -0) || value === 0) return '0';
      if (Math.abs(value) < 0.0001) return value.toExponential(2);
      return String(Number(value.toPrecision(5)));
    };
    const formatVector = (vector) => '(' + vector.map(format).join(', ') + ')';
    const detectPreset = (matrix) => Object.keys(presets).find((name) => matrix.every((row, r) => row.every((value, c) => Math.abs(value - presets[name][r][c]) < 1e-12))) || 'custom';
    let state = { matrix: copyMatrix(presets.shear), vector: [1, 1, 1] };

    function analyze(matrix) {
      const scale = Math.max(...matrix.flat().map(Math.abs));
      const trace = matrix[0][0] + matrix[1][1] + matrix[2][2];
      if (scale === 0) return { rank: 0, scale, trace, determinantSign: 0 };
      // Normalize first: uniformly tiny, well-conditioned matrices retain full rank.
      // Complete pivoting bounds elimination multipliers and tracks determinant sign
      // even when the direct 3x3 determinant underflows in floating-point arithmetic.
      const rows = matrix.map(row => row.map(value => value / scale));
      let rank = 0;
      let determinantSign = 1;
      for (let step = 0; step < 3; step++) {
        let pivotRow = step;
        let pivotColumn = step;
        let largest = 0;
        for (let row = step; row < 3; row++) {
          for (let column = step; column < 3; column++) {
            const magnitude = Math.abs(rows[row][column]);
            if (magnitude > largest) { largest = magnitude; pivotRow = row; pivotColumn = column; }
          }
        }
        if (largest <= rankRelativeTolerance) break;
        if (pivotRow !== step) {
          [rows[step], rows[pivotRow]] = [rows[pivotRow], rows[step]];
          determinantSign *= -1;
        }
        if (pivotColumn !== step) {
          rows.forEach(row => { [row[step], row[pivotColumn]] = [row[pivotColumn], row[step]]; });
          determinantSign *= -1;
        }
        const pivot = rows[step][step];
        determinantSign *= Math.sign(pivot);
        for (let row = step + 1; row < 3; row++) {
          const factor = rows[row][step] / pivot;
          rows[row][step] = 0;
          for (let column = step + 1; column < 3; column++) rows[row][column] -= factor * rows[step][column];
        }
        rank++;
      }
      return { rank, scale, trace, determinantSign: rank === 3 ? determinantSign : 0 };
    }

    function orientation(det, analysis) {
      if (analysis.rank < 3) return { value: 'collapsed', text: exactCollapse(analysis) ? '体积为 0 · 降维' : '数值上近降维 · 取向不作判断' };
      return analysis.determinantSign < 0 ? { value: 'reversed', text: '取向翻转' } : { value: 'preserved', text: '取向保持' };
    }

    function exactCollapse(analysis) {
      return analysis.scale === 0 || ['flatten', 'lineProjection'].some((name) =>
        state.matrix.every((row, r) => row.every((value, c) => value === presets[name][r][c])));
    }

    function precisionLimited(det, analysis) {
      // A rounded zero can result from cancellation or underflow. Numerical
      // rank alone cannot establish an exactly zero determinant for custom input.
      return det === 0 && !exactCollapse(analysis);
    }

    function clearValidation() {
      errorOutput.textContent = '';
      matrixInputs.concat(vectorInputs).forEach((input) => input.removeAttribute('aria-invalid'));
    }

    function updateInfo() {
      const det = determinant(state.matrix);
      const analysis = analyze(state.matrix);
      const limited = precisionLimited(det, analysis);
      productOutput.textContent = formatVector(multiply(state.matrix, state.vector));
      detOutput.textContent = limited ? '≈ 0（浮点精度受限）' : format(det);
      volumeOutput.textContent = limited ? '≈ 0（浮点精度受限）' : format(Math.abs(det));
      traceOutput.textContent = format(analysis.trace);
      rankOutput.textContent = analysis.rank + ' / 3';
      invertibleOutput.textContent = analysis.rank === 3 ? '可逆（数值判断）' : '不可逆或近奇异';
      orientationOutput.textContent = orientation(det, analysis).text;
      presetInput.value = detectPreset(state.matrix);
    }

    function updateControls() {
      matrixInputs.forEach((input, index) => { input.value = String(state.matrix[Math.floor(index / 3)][index % 3]); });
      vectorInputs.forEach((input, index) => { input.value = String(state.vector[index]); });
      clearValidation();
      updateInfo();
    }

    function restore(data) {
      state = data && validMatrix(data.matrix) && validVector(data.vector)
        ? { matrix: copyMatrix(data.matrix), vector: data.vector.slice() }
        : { matrix: copyMatrix(presets.shear), vector: [1, 1, 1] };
      updateControls();
    }

    function readInputs() {
      const inputs = matrixInputs.concat(vectorInputs);
      let firstInvalid = -1;
      const values = inputs.map((input, index) => {
        const value = input.value.trim() === '' ? NaN : Number(input.value);
        const valid = validNumber(value);
        if (valid) input.removeAttribute('aria-invalid');
        else {
          input.setAttribute('aria-invalid', 'true');
          if (firstInvalid < 0) firstInvalid = index;
        }
        return value;
      });
      if (firstInvalid >= 0) {
        const label = firstInvalid < 9
          ? 'A 第 ' + (Math.floor(firstInvalid / 3) + 1) + ' 行第 ' + (firstInvalid % 3 + 1) + ' 列'
          : 'v 的 ' + ['x', 'y', 'z'][firstInvalid - 9] + ' 分量';
        errorOutput.textContent = label + ' 需为 −3 至 3 的有限数值；图中保留上一次有效值。';
        return;
      }
      errorOutput.textContent = '';
      state = { matrix: [values.slice(0, 3), values.slice(3, 6), values.slice(6, 9)], vector: values.slice(9) };
      updateInfo();
      if (typeof onChange === 'function') onChange();
    }

    matrixInputs.concat(vectorInputs).forEach((input) => input.addEventListener('input', readInputs));
    presetInput.addEventListener('change', () => {
      if (!Object.prototype.hasOwnProperty.call(presets, presetInput.value)) return;
      state.matrix = copyMatrix(presets[presetInput.value]);
      updateControls();
      if (typeof onChange === 'function') onChange();
    });

    function context() {
      const det = determinant(state.matrix);
      const analysis = analyze(state.matrix);
      return {
        kind: 'matrix',
        matrix: copyMatrix(state.matrix),
        vector: state.vector.slice(),
        transformedVector: multiply(state.matrix, state.vector),
        determinant: det,
        volumeScale: Math.abs(det),
        trace: analysis.trace,
        rank: analysis.rank,
        invertible: analysis.rank === 3,
        rankRelativeTolerance,
        rankScale: analysis.scale,
        rankInterpretation,
        determinantPrecisionLimited: precisionLimited(det, analysis),
        orientation: orientation(det, analysis).value,
        preset: detectPreset(state.matrix)
      };
    }

    function scene() {
      const unit = Array.from({ length: 8 }, (_, index) => [index & 1, (index >> 1) & 1, (index >> 2) & 1]);
      const transformed = unit.map((point) => multiply(state.matrix, point));
      const columns = [0, 1, 2].map((index) => state.matrix.map((row) => row[index]));
      const product = multiply(state.matrix, state.vector);
      const lines = [];
      const faces = [];
      const labels = [];
      const dots = [];
      const origin = [0, 0, 0];
      unit.forEach((point, index) => {
        [1, 2, 4].forEach((bit) => {
          if (index < (index ^ bit)) {
            lines.push({ points: [point, unit[index ^ bit]], color: 'neutral', width: 1, opacity: 0.55, dashed: true });
            lines.push({ points: [transformed[index], transformed[index ^ bit]], color: 's1', width: 1.8, opacity: 0.9 });
          }
        });
      });
      [[0, 1, 3, 2], [4, 5, 7, 6], [0, 1, 5, 4], [2, 3, 7, 6], [0, 2, 6, 4], [1, 3, 7, 5]].forEach((indices) => {
        faces.push({ points: indices.map((index) => transformed[index]), color: 's1', opacity: 0.075 });
      });
      columns.forEach((column, index) => {
        lines.push({ points: [origin, column], color: 's1', width: 2.6, arrow: true });
        labels.push({ point: column, text: ['Ae₁', 'Ae₂', 'Ae₃'][index], color: 'neutral' });
      });
      lines.push({ points: [origin, state.vector.slice()], color: 'neutral', width: 1.7, opacity: 0.8, dashed: true, arrow: true });
      lines.push({ points: [origin, product], color: 's2', width: 3, arrow: true });
      dots.push({ point: state.vector.slice(), color: 'neutral', radius: 3 });
      dots.push({ point: product, color: 's2', radius: 4 });
      const equalVectors = product.every((value, index) => Math.abs(value - state.vector[index]) < 1e-10);
      if (equalVectors) labels.push({ point: product, text: 'v = Av', color: 'neutral' });
      else {
        labels.push({ point: state.vector.slice(), text: 'v', color: 'neutral' });
        labels.push({ point: product, text: 'Av', color: 'neutral' });
      }
      const data = context();
      return {
        lines,
        faces,
        dots,
        labels,
        bounds: unit.concat(transformed, columns, [state.vector.slice(), product]),
        summary: presetNames[data.preset] + ' · 虚线为变换前，实线为变换后'
      };
    }

    restore(initialState);
    return { scene, context, restore };
  };
})();
