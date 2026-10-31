window.MathLabScenes.coordinates = function(container, initial, onChange) {
  const state = { point: [1, 1, 1], projections: true };
  const q = id => container.querySelector('#' + id);
  const fmt = n => Number(n.toFixed(4)).toString();
  function sync() {
    ['x', 'y', 'z'].forEach((key, i) => { q('ml-point-' + key).value = state.point[i]; q('ml-point-' + key + '-value').textContent = state.point[i].toFixed(2); });
    q('ml-projections').checked = state.projections;
    q('ml-point-readout').textContent = 'P = (' + state.point.map(fmt).join(', ') + ') · |OP| = ' + fmt(Math.hypot(...state.point));
  }
  function restore(data) {
    if (Array.isArray(data?.point) && data.point.length === 3 && data.point.every(Number.isFinite)) state.point = data.point.map(v => Math.max(-2, Math.min(2, Math.round(v * 20) / 20)));
    if (typeof data?.projections === 'boolean') state.projections = data.projections;
    sync();
  }
  ['x', 'y', 'z'].forEach((key, i) => q('ml-point-' + key).addEventListener('input', event => { state.point[i] = Number(event.target.value); sync(); onChange(); }));
  q('ml-projections').addEventListener('change', event => { state.projections = event.target.checked; onChange(); });
  restore(initial);
  return {
    restore,
    context: () => ({ point: [...state.point], projections: state.projections, length: Math.hypot(...state.point), interpretation: 'P 的直角坐标，OP 为位置向量；坐标无量纲' }),
    scene() {
      const [x, y, z] = state.point, origin = [0, 0, 0];
      const lines = [{ points: [origin, state.point], color: 's1', width: 2.5, arrow: true }];
      if (state.projections) {
        lines.push({ points: [state.point, [x, y, 0]], color: 's2', dashed: true });
        lines.push({ points: [[x, 0, 0], [x, y, 0], [0, y, 0]], color: 's2', dashed: true });
        lines.push({ points: [state.point, [0, 0, z]], color: 's2', dashed: true });
      }
      const nonzero = Math.hypot(x, y, z) > 0;
      return { lines, dots: nonzero ? [{ point: state.point, color: 's1', radius: 6, label: 'P' }] : [], labels: nonzero ? [] : [{point: origin,text:'P = O'}], bounds: [[-2.4, -2.4, -2.4], [2.4, 2.4, 2.4]], axisExtent: 2.3, summary: 'P = (' + state.point.map(fmt).join(', ') + ') · 到原点距离 ' + fmt(Math.hypot(x, y, z)) };
    }
  };
};
