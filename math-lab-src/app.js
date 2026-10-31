(() => {
  const root = document.getElementById('math-lab');
  const q = id => root.querySelector('#' + id);
  const canvas = q('ml-canvas'), ctx = canvas.getContext('2d');
  const probe = root.querySelector('.ml-color-probe');
  const keys = ['geometry', 'coordinates', 'matrix', 'crystal'];
  const names = { geometry: '几何曲面', coordinates: '三维坐标', matrix: '矩阵变换', crystal: '晶体结构' };
  const plotTitles = { geometry: '曲面与截线', coordinates: '点与坐标投影', matrix: '线性变换的几何', crystal: '晶胞与晶面' };
  const legends = { geometry: ['曲面', '截线 y = c'], coordinates: ['向量 OP', '坐标投影'], matrix: ['变换后的基与立方体', '向量 Av'], crystal: ['晶格点', '选中格点与晶面'] };
  const cameraPresets = { iso: { yaw: .70, pitch: .55 }, xy: { yaw: 0, pitch: Math.PI / 2 }, xz: { yaw: 0, pitch: 0 }, yz: { yaw: Math.PI / 2, pitch: 0 } };
  const modules = {}, cameras = {};
  let mode = 'geometry', scene = null, scheduled = false, saveTimer, drag = null;
  function color(token) { probe.style.color = 'var(' + token + ')'; return getComputedStyle(probe).color; }
  function getPalette() { return { neutral: color('--muted-foreground'), foreground: color('--foreground'), background: color('--background'), grid: color('--border'), s1: color('--viz-series-1'), s2: color('--viz-series-2'), s3: color('--viz-series-3') }; }
  let palette = getPalette();
  function restoredCamera(value) {
    return {
      yaw: Number.isFinite(value?.yaw) ? value.yaw : .70,
      pitch: Number.isFinite(value?.pitch) ? Math.max(0, Math.min(Math.PI / 2, value.pitch)) : .55,
      zoom: Number.isFinite(value?.zoom) ? Math.max(.6, Math.min(2, value.zoom)) : 1,
      grid: typeof value?.grid === 'boolean' ? value.grid : true
    };
  }
  function syncViewControls() {
    const view = cameras[mode];
    q('ml-zoom').value = view.zoom;
    q('ml-zoom-value').textContent = Math.round(view.zoom * 100) + '%';
    q('ml-grid').checked = view.grid;
    root.querySelectorAll('[data-camera]').forEach(button => {
      const preset = cameraPresets[button.dataset.camera];
      const sameYaw = Math.abs(Math.atan2(Math.sin(view.yaw - preset.yaw), Math.cos(view.yaw - preset.yaw))) < 1e-8;
      button.setAttribute('aria-pressed', String(sameYaw && Math.abs(view.pitch - preset.pitch) < 1e-8));
    });
  }
  function viewChanged() { syncViewControls(); requestDraw(); scheduleSave(); }
  function safeSaved() {
    try {
      const state = window.openai?.widgetState;
      if (state?.modelContent?.version === 2) return state;
    } catch (_) {}
    return null;
  }
  const stored = safeSaved();
  if (keys.includes(stored?.modelContent?.mode)) mode = stored.modelContent.mode;
  for (const key of keys) {
    cameras[key] = restoredCamera(stored?.privateContent?.cameras?.[key]);
    modules[key] = window.MathLabScenes[key](root.querySelector('[data-scene="' + key + '"]'), stored?.modelContent?.scenes?.[key], changed);
  }
  function modelContent() {
    return { version: 2, mode, scope: '数学几何、三维坐标、矩阵、晶体几何', scenes: Object.fromEntries(keys.map(key => [key, modules[key].context()])) };
  }
  function persist() {
    const content = modelContent();
    try {
      const request = window.openai?.setWidgetState?.({ modelContent: content, privateContent: { cameras } });
      if (request?.catch) request.catch(() => {});
    } catch (_) {}
    if (window.mathMcpBridge?.ready) window.mathMcpBridge.updateContext({ mode, state: modules[mode].context() }).catch(() => {});
  }
  function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(persist, 220); }
  function changed() { refreshScene(); scheduleSave(); }
  function refreshScene() {
    scene = modules[mode].scene();
    q('ml-summary').textContent = scene.summary;
    canvas.setAttribute('aria-label', names[mode] + '：' + scene.summary + '。拖动或使用下方视角按钮旋转。');
    q('ml-axis-caption').textContent = mode === 'crystal' ? '坐标单位：晶胞边长 a' : '等比例坐标轴';
    q('ml-plot-title').textContent = plotTitles[mode];
    q('ml-legend-main').textContent = legends[mode][0];
    q('ml-legend-secondary').textContent = legends[mode][1];
    syncViewControls();
    requestDraw();
  }
  function setMode(next, save = true) {
    if (!keys.includes(next)) return;
    mode = next;
    root.querySelectorAll('[data-scene]').forEach(panel => { panel.hidden = panel.dataset.scene !== mode; });
    root.querySelectorAll('[data-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === mode)));
    q('ml-error').hidden = true;
    refreshScene();
    if (save) scheduleSave();
  }
  function requestDraw() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; draw(); });
  }
  const finitePoint = p => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite);
  function draw() {
    if (!scene) return;
    const width = canvas.clientWidth, height = canvas.clientHeight;
    if (!width || !height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);
    const view = cameras[mode], ca = Math.cos(view.yaw), sa = Math.sin(view.yaw), cp = Math.cos(view.pitch), sp = Math.sin(view.pitch);
    const raw = ([x, y, z]) => { const depth = x * sa + y * ca; return [x * ca - y * sa, -z * cp + depth * sp, depth * cp + z * sp]; };
    const axisLength = scene.axisExtent || (mode === 'crystal' ? (modules.crystal.context().repeat || 1) + 0.22 : 1.5);
    const axes = [0,1,2].map(i => { const p=[0,0,0];p[i]=axisLength;return p; });
    const dataBounds = (scene.bounds || []).filter(finitePoint);
    const allBounds = dataBounds.concat([[0,0,0]], axes);
    const mins=[0,1,2].map(i=>Math.min(...allBounds.map(p=>p[i]))), maxs=[0,1,2].map(i=>Math.max(...allBounds.map(p=>p[i])));
    const corners=[];
    for(const x of [mins[0],maxs[0]])for(const y of [mins[1],maxs[1]])for(const z of [mins[2],maxs[2]])corners.push(raw([x,y,z]));
    const xmin=Math.min(...corners.map(p=>p[0])), xmax=Math.max(...corners.map(p=>p[0])), ymin=Math.min(...corners.map(p=>p[1])), ymax=Math.max(...corners.map(p=>p[1]));
    const scale=Math.min((width-66)/Math.max(0.1,xmax-xmin),(height-66)/Math.max(0.1,ymax-ymin))*view.zoom;
    const project=p=>{const v=raw(p);return[width/2+(v[0]-(xmin+xmax)/2)*scale,height/2+(v[1]-(ymin+ymax)/2)*scale,v[2]];};
    function line(item) {
      const pts=item.points.filter(finitePoint).map(project);
      if(pts.length<2)return;
      ctx.globalAlpha=item.opacity??1;ctx.strokeStyle=palette[item.color]||palette.neutral;ctx.fillStyle=ctx.strokeStyle;
      ctx.lineWidth=item.width||1;ctx.setLineDash(item.dashed?[5,4]:[]);
      ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.stroke();ctx.setLineDash([]);
      if(item.arrow){const a=pts[pts.length-2],b=pts[pts.length-1],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);if(length>8){const ux=dx/length,uy=dy/length,k=Math.min(8,length/3);ctx.beginPath();ctx.moveTo(b[0],b[1]);ctx.lineTo(b[0]-k*ux+k*.4*uy,b[1]-k*uy-k*.4*ux);ctx.lineTo(b[0]-k*ux-k*.4*uy,b[1]-k*uy+k*.4*ux);ctx.closePath();ctx.fill();}}
      ctx.globalAlpha=1;
    }
    function face(item){if(!item.points.every(finitePoint))return;const points=item.points.map(project);ctx.globalAlpha=item.opacity??.1;ctx.fillStyle=palette[item.color]||palette.s1;ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();ctx.fill();ctx.globalAlpha=1;}
    const labelQueue=[];
    function dot(item){if(!finitePoint(item.point))return;const p=project(item.point);ctx.fillStyle=palette[item.color]||palette.s1;ctx.globalAlpha=item.opacity??1;ctx.beginPath();ctx.arc(p[0],p[1],item.radius||4,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;if(item.label)labelQueue.push({point:item.point,text:item.label});}
    // The neutral coordinate scaffold remains fixed in world coordinates.
    if(view.grid){
      const low=Math.floor(Math.min(mins[0],mins[1])),high=Math.ceil(Math.max(maxs[0],maxs[1]));
      const step=Math.max(1,Math.ceil((high-low)/8));
      for(let k=low;k<=high;k+=step){line({points:[[k,low,0],[k,high,0]],color:'grid',opacity:.55});line({points:[[low,k,0],[high,k,0]],color:'grid',opacity:.55});}
    }
    axes.forEach((p,i)=>{const start=[0,0,0];if(mins[i]<0)start[i]=mins[i];line({points:[start,p],color:'neutral',width:1,opacity:.7,arrow:true});labelQueue.push({point:p,text:['x','y','z'][i]});});
    const items=[];
    for(const item of scene.faces||[])items.push({kind:'face',data:item,depth:item.points.reduce((v,p)=>v+raw(p)[2],0)/item.points.length});
    for(const item of scene.lines||[])if(!item.overlay)items.push({kind:'line',data:item,depth:item.points.reduce((v,p)=>v+raw(p)[2],0)/item.points.length});
    for(const item of scene.dots||[])items.push({kind:'dot',data:item,depth:raw(item.point)[2]});
    items.sort((a,b)=>a.depth-b.depth);
    for(const item of items){if(item.kind==='face')face(item.data);else if(item.kind==='line')line(item.data);else dot(item.data);}
    for(const item of scene.lines||[])if(item.overlay)line(item);
    labelQueue.push(...(scene.labels||[]));
    if(!(scene.labels||[]).some(item=>item.text==='P = O'))labelQueue.push({point:[0,0,0],text:'O'});
    const font=getComputedStyle(root);ctx.font=font.font||font.fontSize+' '+font.fontFamily;ctx.textAlign='left';ctx.textBaseline='middle';
    const placed=[];
    for(const label of labelQueue){
      if(!finitePoint(label.point))continue;
      const p=project(label.point),tw=ctx.measureText(label.text).width,th=parseFloat(font.fontSize)||14;
      const offsets=[[9,-13],[9,14],[-tw-9,-13],[-tw-9,14],[-tw/2,-24],[-tw/2,26]];
      let chosen=null;
      for(const [dx,dy] of offsets){const x=p[0]+dx,y=p[1]+dy,rect={x:x-2,y:y-th/2-1,w:tw+4,h:th+2};if(rect.x<2||rect.x+rect.w>width-2||rect.y<2||rect.y+rect.h>height-2)continue;if(placed.some(r=>rect.x<r.x+r.w+3&&rect.x+rect.w+3>r.x&&rect.y<r.y+r.h+3&&rect.y+rect.h+3>r.y))continue;chosen={x,y,rect};break;}
      if(!chosen)continue;
      placed.push(chosen.rect);ctx.globalAlpha=.84;ctx.fillStyle=palette.background;ctx.fillRect(chosen.rect.x,chosen.rect.y,chosen.rect.w,chosen.rect.h);ctx.globalAlpha=1;ctx.fillStyle=palette.foreground;ctx.fillText(label.text,chosen.x,chosen.y);
    }
  }
  root.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>setMode(button.dataset.mode)));
  canvas.addEventListener('pointerdown',event=>{if(event.button!==0)return;drag={x:event.clientX,y:event.clientY,id:event.pointerId};canvas.setPointerCapture(event.pointerId);canvas.classList.add('dragging');});
  canvas.addEventListener('pointermove',event=>{if(!drag||event.pointerId!==drag.id)return;const view=cameras[mode];view.yaw+=(event.clientX-drag.x)*.009;view.pitch=Math.max(0,Math.min(Math.PI/2,view.pitch+(event.clientY-drag.y)*.008));drag.x=event.clientX;drag.y=event.clientY;syncViewControls();requestDraw();});
  const endDrag=()=>{if(!drag)return;drag=null;canvas.classList.remove('dragging');scheduleSave();};
  for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,endDrag);
  q('ml-left').addEventListener('click',()=>{cameras[mode].yaw-=.3;viewChanged();});
  q('ml-right').addEventListener('click',()=>{cameras[mode].yaw+=.3;viewChanged();});
  q('ml-elevation').addEventListener('click',()=>{cameras[mode].pitch=cameras[mode].pitch<1?1.35:.55;viewChanged();});
  root.querySelectorAll('[data-camera]').forEach(button=>button.addEventListener('click',()=>{Object.assign(cameras[mode],cameraPresets[button.dataset.camera]);viewChanged();}));
  q('ml-zoom').addEventListener('input',event=>{cameras[mode].zoom=Number(event.target.value);viewChanged();});
  q('ml-grid').addEventListener('change',event=>{cameras[mode].grid=event.target.checked;viewChanged();});
  q('ml-view-reset').addEventListener('click',()=>{cameras[mode]=restoredCamera();viewChanged();});
  q('ml-explain').addEventListener('click',async()=>{
    const button=q('ml-explain'),error=q('ml-error');
    const prompt='我正在数学空间实验室学习'+names[mode]+'。当前状态（公式、坐标和参数）如下：'+JSON.stringify(modules[mode].context())+'。请基于这些具体参数解释图形的数学含义，指出一个值得观察的关系，再给我一个能通过调整参数验证的小问题。范围限于数学、立体几何、矩阵或晶体结构几何，不进行物理实验。';
    button.disabled=true;error.hidden=true;
    try {
      if(window.mathMcpBridge?.ready)await window.mathMcpBridge.sendMessage(prompt);
      else if(window.openai?.sendFollowUpMessage)await window.openai.sendFollowUpMessage({prompt,title:'解释当前'+names[mode]});
      else throw new Error('此页面尚未连接聊天。请在聊天里附上当前公式或参数提问。');
    }catch(e){error.textContent=e?.message==='此页面尚未连接聊天。请在聊天里附上当前公式或参数提问。'?e.message:'消息未发送。请重试，或在聊天里附上当前公式和参数提问。';error.hidden=false;}finally{button.disabled=false;}
  });
  function receiveTool(data){
    if(!data||!keys.includes(data.mode))return;
    clearTimeout(saveTimer);
    modules[data.mode].restore(data.state||{});
    setMode(data.mode,false);
  }
  window.addEventListener('math-lab:tool-result',event=>receiveTool(event.detail));
  window.addEventListener('math-lab:host-context',()=>{palette=getPalette();requestDraw();});
  window.addEventListener('openai:set_globals',event=>{
    const globals=event.detail?.globals;if(!globals)return;
    const saved=globals.widgetState;
    if(saved?.modelContent?.version===2){clearTimeout(saveTimer);for(const key of keys){if(saved.modelContent.scenes?.[key])modules[key].restore(saved.modelContent.scenes[key]);cameras[key]=restoredCamera(saved.privateContent?.cameras?.[key]);}setMode(saved.modelContent.mode,false);}
    if(globals.toolOutput)receiveTool(globals.toolOutput);
    palette=getPalette();requestDraw();
  });
  new ResizeObserver(requestDraw).observe(canvas);
  new MutationObserver(()=>{palette=getPalette();requestDraw();}).observe(document.documentElement,{attributes:true,attributeFilter:['class','style','data-theme']});
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{palette=getPalette();requestDraw();});
  setMode(mode,false);
  if(window.openai?.toolOutput)receiveTool(window.openai.toolOutput);
  if(window.mathMcpBridge?.lastToolResult)receiveTool(window.mathMcpBridge.lastToolResult);
})();
