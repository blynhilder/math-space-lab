(function () {
  'use strict';

  // Conventional P/I/F cell centring and effective lattice-point counts:
  // https://www.doitpoms.ac.uk/tlplib/crystallography3/unit_cell.php
  // Fractional coordinates and the plane-family equation hx + ky + lz = C:
  // https://dictionary.iucr.org/Miller_indices
  // Here C = 1 selects one intercept plane; no complete plane family is drawn.

  const TYPES = {
    SC: { name: '简单立方', effective: 1, countFormula: '8 × 1/8 = 1' },
    BCC: { name: '体心立方', effective: 2, countFormula: '8 × 1/8 + 1 = 2' },
    FCC: { name: '面心立方', effective: 4, countFormula: '8 × 1/8 + 6 × 1/2 = 4' }
  };
  const PLANES = {
    '100': { indices: [1, 0, 0], equation: 'x = 1' },
    '110': { indices: [1, 1, 0], equation: 'x + y = 1' },
    '111': { indices: [1, 1, 1], equation: 'x + y + z = 1' }
  };
  const DEFAULTS = { type: 'BCC', repeat: 1, plane: '110', selection: '0.5,0.5,0.5' };

  function has(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
  }

  // Half-integer grid coordinates make shared boundary points exactly deduplicated.
  function latticePoints(type, repeat) {
    const points = [];
    for (let x = 0; x <= 2 * repeat; x += 1) {
      for (let y = 0; y <= 2 * repeat; y += 1) {
        for (let z = 0; z <= 2 * repeat; z += 1) {
          const odd = (x % 2) + (y % 2) + (z % 2);
          if (odd === 0 || (type === 'BCC' && odd === 3) || (type === 'FCC' && odd === 2)) {
            points.push([x / 2, y / 2, z / 2]);
          }
        }
      }
    }
    return points;
  }

  function key(point) { return point.join(','); }
  function fraction(number) { return number === 0.5 ? '½' : String(number); }
  function coordinate(point) { return '(' + point.map(fraction).join(', ') + ')'; }
  function pointKind(point) {
    const halves = point.filter(value => value === 0.5).length;
    return halves === 0 ? '顶点' : halves === 3 ? '体心' : '面心';
  }

  function validState(data) {
    const value = data && typeof data === 'object' ? data : {};
    const candidateType = typeof value.type === 'string' ? value.type.toUpperCase() : '';
    const type = has(TYPES, candidateType) ? candidateType : DEFAULTS.type;
    const repeat = value.repeat === 2 || value.repeat === '2' ? 2 : 1;
    const plane = typeof value.plane === 'string' && (value.plane === 'none' || has(PLANES, value.plane)) ? value.plane : DEFAULTS.plane;
    const points = latticePoints(type, 1);
    const preferred = type === 'BCC' ? DEFAULTS.selection : type === 'FCC' ? '0,0.5,0.5' : '1,1,1';
    const selection = points.some(point => key(point) === value.selection) ? value.selection : preferred;
    return { type, repeat, plane, selection };
  }

  function planePolygon(plane, repeat) {
    if (plane === '100') return [[1, 0, 0], [1, repeat, 0], [1, repeat, repeat], [1, 0, repeat]];
    if (plane === '110') return [[1, 0, 0], [0, 1, 0], [0, 1, repeat], [1, 0, repeat]];
    if (plane === '111') return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    return [];
  }

  window.MathLabScenes = window.MathLabScenes || {};
  window.MathLabScenes.crystal = function (container, initialState, onChange) {
    const control = name => container.querySelector('[data-crystal="' + name + '"]');
    const elements = {
      type: control('type'), repeat: control('repeat'), plane: control('plane'),
      selection: control('selection'), coordinate: control('coordinate'),
      counts: control('counts'), planeEquation: control('plane-equation')
    };
    let state = validState(initialState);

    function selectedPoint() {
      return state.selection.split(',').map(Number);
    }

    function updateControls() {
      elements.type.value = state.type;
      elements.repeat.value = String(state.repeat);
      elements.plane.value = state.plane;
      const options = latticePoints(state.type, 1).map(point => {
        const option = document.createElement('option');
        option.value = key(point);
        option.textContent = pointKind(point) + ' ' + coordinate(point);
        return option;
      });
      elements.selection.replaceChildren(...options);
      elements.selection.value = state.selection;
      elements.coordinate.textContent = 'P = ' + coordinate(selectedPoint());
      const total = latticePoints(state.type, state.repeat).length;
      elements.counts.textContent = '单胞有效点数 ' + TYPES[state.type].effective + ' · 屏幕点数 ' + total;
      elements.planeEquation.textContent = state.plane === 'none' ? '晶面未显示' : '(' + state.plane + ')：' + PLANES[state.plane].equation;
    }

    function change() {
      state = validState({
        type: elements.type.value,
        repeat: elements.repeat.value,
        plane: elements.plane.value,
        selection: elements.selection.value
      });
      updateControls();
      if (typeof onChange === 'function') onChange();
    }

    ['type', 'repeat', 'plane', 'selection'].forEach(name => elements[name].addEventListener('change', change));
    updateControls();

    return {
      scene() {
        const n = state.repeat;
        const lines = [];
        for (let x = 0; x <= n; x += 1) {
          for (let y = 0; y <= n; y += 1) {
            for (let z = 0; z <= n; z += 1) {
              const origin = [x, y, z];
              for (let axis = 0; axis < 3; axis += 1) {
                if (origin[axis] === n) continue;
                const end = origin.slice();
                end[axis] += 1;
                const isOuterEdge = origin.every((value, index) => index === axis || value === 0 || value === n);
                lines.push({ points: [origin.slice(), end], color: 'neutral', width: 1, opacity: isOuterEdge ? 0.65 : 0.3 });
              }
            }
          }
        }
        const points = latticePoints(state.type, n);
        const dots = points.map(point => ({
          point,
          color: key(point) === state.selection ? 's2' : 's1',
          radius: key(point) === state.selection ? 6 : 4,
          ...(key(point) === state.selection ? { label: 'P' } : {})
        }));
        const polygon = planePolygon(state.plane, n);
        const faces = polygon.length ? [{ points: polygon, color: 's2', opacity: 0.12 }] : [];
        const labels = [];
        if (polygon.length) {
          lines.push({ points: polygon.concat([polygon[0]]), color: 's2', width: 1.5, opacity: 0.8 });
          const centre = [0, 1, 2].map(axis => polygon.reduce((sum, point) => sum + point[axis], 0) / polygon.length);
          labels.push({ point: centre, text: '(' + state.plane + ')', color: 'neutral' });
        }
        const bounds = [];
        for (const x of [0, n]) for (const y of [0, n]) for (const z of [0, n]) bounds.push([x, y, z]);
        return {
          lines, faces, dots, labels, bounds,
          summary: TYPES[state.type].name + ' · ' + n + '×' + n + '×' + n + ' · 单胞有效点数 ' + TYPES[state.type].effective
        };
      },
      context() {
        return {
          ...state,
          scene: 'crystal',
          latticeName: TYPES[state.type].name,
          fractionalCoordinates: selectedPoint(),
          coordinateConvention: '相对于常规立方晶胞基矢的分数坐标；a = 1；所选点位于原点晶胞 [0,1]^3',
          effectivePointsPerConventionalCell: TYPES[state.type].effective,
          effectivePointsInBlock: TYPES[state.type].effective * state.repeat ** 3,
          countingFormula: TYPES[state.type].countFormula,
          visiblePointCount: latticePoints(state.type, state.repeat).length,
          representation: '点阵示意；视觉点数含共享边界点，标记大小不代表真实原子半径',
          representativePlane: state.plane === 'none' ? null : {
            indices: PLANES[state.plane].indices.slice(),
            equation: PLANES[state.plane].equation,
            convention: 'hx + ky + lz = 1 的单张代表面；裁剪到 [0,n]^3，n 是每轴晶胞数；未显示全部平行面或对称等价面'
          }
        };
      },
      restore(data) {
        state = validState(data);
        updateControls();
      }
    };
  };
})();
