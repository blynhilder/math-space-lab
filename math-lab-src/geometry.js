window.MathLabScenes.geometry = function(container, initial, onChange) {
  const state = { type: 'custom', expression: 'sin(x)*cos(y)', a: 0.5, b: -0.5, c: 0.5, r: 1.5 };
  const examples = {
    waves: { expression: 'sin(x)*cos(y)', note: '沿 x、y 方向起伏，移动截面比较波形。' },
    gaussian: { expression: 'exp(-(x^2+y^2))', note: '中心最高，向四周平滑衰减。' },
    saddle: { expression: 'a*x^2+b*y^2', a: 0.5, b: -0.5, note: '两个方向一升一降；调整 a、b 比较曲率。' },
    paraboloid: { expression: 'a*x^2+b*y^2', a: 0.5, b: 0.5, note: '两个方向向上弯曲；调整 a、b 比较开口。' },
    cone: { expression: 'sqrt(x^2+y^2)', note: '高度等于到原点的平面距离，中心形成锥尖。' },
    hemisphere: { expression: 'sqrt(4-x^2-y^2)', note: '半径 2 的上半球，圆盘定义域之外留空。' },
    ripples: { expression: 'exp(-0.5*(x^2+y^2))*cos(4*sqrt(x^2+y^2))', note: '同心波纹向外衰减，穿过中心的截线左右对称。' },
    pole: { expression: '1/x', note: 'x = 0 处不定义，截线保留两支并在间断处断开。' }
  };
  const q = id => container.querySelector('#' + id), fmt = v => Number(v.toFixed(6)).toString();
  const term = (v, tail = '') => (v < 0 ? ' − ' : ' + ') + fmt(Math.abs(v)) + tail;
  let compiled = null, expressionError = '', pending = false, example = 'custom';
  const matchingExample = () => state.type === 'custom' ? Object.keys(examples).find(key => {
    const item = examples[key];
    return state.expression === item.expression && ['a','b'].every(parameter => item[parameter] === undefined || item[parameter] === state[parameter]);
  }) || 'custom' : 'custom';
  const f = (x, y) => {
    const z = state.type === 'custom' ? compiled?.evaluate({ x, y, a: state.a, b: state.b }) : state.a*x*x + state.b*y*y;
    return Number.isFinite(z) && Math.abs(z) <= 8 ? z : NaN;
  };
  const point = (x, y) => { const z = f(x, y); return Number.isFinite(z) ? [x,y,z] : null; };
  // Probe between endpoints; omit poles and unresolved steep intervals.
  function safeEdge(p, r, depth = 0) {
    if (!p || !r) return false;
    if (state.type !== 'custom') return true;
    if (Math.abs(p[2]-r[2]) > 2) return false;
    const samples = [p];
    for (const t of [.25,.5,.75]) {
      const s = point(p[0]+(r[0]-p[0])*t,p[1]+(r[1]-p[1])*t);
      if (!s || Math.abs(s[2]-(p[2]+(r[2]-p[2])*t)) > 2) return false;
      samples.push(s);
    }
    samples.push(r);
    const curvature = Math.max(...samples.slice(1,-1).map((s,i)=>Math.abs(s[2]-(p[2]+(r[2]-p[2])*(i+1)/4))));
    if (curvature <= .08) return true;
    if (depth >= 4) return false;
    return samples.slice(1).every((s,i)=>safeEdge(samples[i],s,depth+1));
  }
  function splitCurve(points) {
    const segments=[]; let run=[];
    for (const p of points) {
      if (!p) { if(run.length>1)segments.push(run); run=[]; continue; }
      if (run.length && !safeEdge(run[run.length-1],p)) { if(run.length>1)segments.push(run);run=[]; }
      run.push(p);
    }
    if(run.length>1)segments.push(run);
    return segments;
  }
  function section() {
    if (state.type !== 'sphere') {
      const segments = splitCurve(Array.from({length:201},(_,i)=>point(-2+i/50,state.c)));
      const equation = state.type === 'custom' ? (compiled ? 'z = '+state.expression+'，代入 y = '+fmt(state.c)+(segments.length?'':' · 当前范围内无可绘制截线') : pending?'表达式待绘制':'表达式无效，未绘制曲面') : 'z = '+fmt(state.a)+'x²'+term(state.b*state.c*state.c);
      return {segments,points:segments.flat(),equation};
    }
    const delta = state.r*state.r-state.c*state.c;
    if(delta < -1e-9)return {segments:[],points:[],equation:'|c| > r · 无交线'};
    if(Math.abs(delta)<1e-9)return {segments:[],points:[[0,state.c,0]],equation:'|c| = r · 相切于一点'};
    const rho=Math.sqrt(delta),points=Array.from({length:101},(_,i)=>{const t=2*Math.PI*i/100;return[rho*Math.cos(t),state.c,rho*Math.sin(t)];});
    return {segments:[points],points,equation:'x² + z² = '+fmt(delta)+' · 截圆半径 ≈ '+fmt(rho)};
  }
  function shape() {
    if(state.type==='sphere')return '球面 · 半径 '+fmt(state.r);
    if(state.type==='custom')return compiled?'自由函数 · z = '+state.expression:pending?'表达式待绘制':'表达式无效';
    if(state.a===0&&state.b===0)return '平面';
    if(state.a===0||state.b===0)return '抛物柱面';
    if(state.a*state.b<0)return '马鞍形';
    return state.a>0?'碗形':'倒碗形';
  }
  function compileExpression() {
    compiled=null;expressionError='';pending=false;
    try { compiled=window.MathLabExpression.compile(state.expression);state.expression=compiled.expression; }
    catch(error) { expressionError=error.message; }
  }
  function sync() {
    q('ml-geometry-type').value=state.type;
    q('ml-quadratic-controls').hidden=state.type==='sphere';q('ml-sphere-controls').hidden=state.type!=='sphere';q('ml-custom-controls').hidden=state.type!=='custom';
    q('ml-geo-example').value=example;
    q('ml-geo-example-note').textContent=examples[example]?.note || '选择示例立即绘制，或输入自己的二元函数。';
    const parameters=['a','b'].filter(key=>new RegExp('\\b'+key+'\\b','i').test(state.expression));
    q('ml-geo-parameter-note').textContent=state.type==='quadratic'?'调整两个方向的曲率，正负号决定弯曲方向。':parameters.length?'表达式中的 '+parameters.join('、')+' 随滑块实时更新。':'当前表达式未使用 a、b；写入参数后即可联动。';
    q('ml-geo-expression').value=state.expression;
    q('ml-geo-expression').setAttribute('aria-invalid',String(Boolean(expressionError)));
    q('ml-geo-expression-error').textContent=expressionError;q('ml-geo-expression-error').hidden=!expressionError;
    for(const key of ['a','b','c','r']){q('ml-geo-'+key).value=state[key];q('ml-geo-'+key+'-value').textContent=state[key].toFixed(2);}
    q('ml-geo-equation').textContent=state.type==='sphere'?'x² + y² + z² = '+fmt(state.r*state.r):state.type==='quadratic'?'z = '+fmt(state.a)+'x²'+term(state.b,'y²'):compiled?'z = '+state.expression:pending?'待绘制：z = '+state.expression:'未绘制：请修正函数表达式';
    q('ml-geo-cut-equation').textContent=section().equation;
    drawCut();
  }
  function drawCut() {
    const svg=q('ml-geo-cut'),width=svg.clientWidth,height=svg.clientHeight;
    if(!width)return;
    svg.setAttribute('viewBox','0 0 '+width+' '+height);
    const data=section(),left=54,right=width-12,top=12,bottom=height-33;
    let lo,hi,xmap,zmap;
    if(state.type==='sphere') {lo=-2.15;hi=2.15;const scale=Math.min((right-left)/4.3,(bottom-top)/4.3);xmap=x=>(left+right)/2+x*scale;zmap=z=>(top+bottom)/2-z*scale;}
    else {
      const values=data.points.map(p=>p[2]),zmin=Math.min(0,...values),zmax=Math.max(0,...values),padding=Math.max(.5,(zmax-zmin)*.1);
      lo=zmin-padding;hi=zmax+padding;xmap=x=>left+(x+2.15)/4.3*(right-left);zmap=z=>bottom-(z-lo)/(hi-lo)*(bottom-top);
    }
    const E=(tag,attrs,text)=>{const el=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const[k,v]of Object.entries(attrs))el.setAttribute(k,v);if(text!==undefined)el.textContent=text;return el;};
    svg.replaceChildren(E('title',{},'截面 y = '+fmt(state.c)+'；'+data.equation));
    svg.append(E('rect',{x:left,y:top,width:right-left,height:bottom-top,fill:'none',stroke:'var(--border)'}));
    svg.append(E('line',{x1:left,x2:right,y1:zmap(0),y2:zmap(0),stroke:'var(--border)'}));
    svg.append(E('line',{x1:xmap(0),x2:xmap(0),y1:top,y2:bottom,stroke:'var(--border)'}));
    for(const x of[-2,0,2])svg.append(E('text',{x:xmap(x),y:bottom+18,'text-anchor':'middle',class:'text-small'},String(x)));
    const ticks=state.type==='sphere'?[-2,0,2]:[Number((lo+(hi-lo)*.15).toFixed(1)),0,Number((hi-(hi-lo)*.15).toFixed(1))];
    [...new Set(ticks)].forEach(z=>svg.append(E('text',{x:left-8,y:zmap(z)+4,'text-anchor':'end',class:'text-small'},fmt(z))));
    for(const points of data.segments)svg.append(E('path',{d:points.map((p,i)=>(i?'L':'M')+xmap(p[0])+','+zmap(p[2])).join(' '),stroke:'var(--viz-series-2)','stroke-width':2.5,fill:'none','data-cut-curve':''}));
    if(data.points.length===1)svg.append(E('circle',{cx:xmap(0),cy:zmap(0),r:4,fill:'var(--viz-series-2)','data-tangent-point':''}));
    svg.append(E('text',{x:(left+right)/2,y:height-1,'text-anchor':'middle',class:'text-small'},'x'));
    svg.append(E('text',{x:12,y:(top+bottom)/2,'text-anchor':'middle',class:'text-small'},'z'));
    svg.setAttribute('aria-label','截面 y='+state.c+'；'+data.equation);
  }
  function restore(data) {
    if(['sphere','quadratic','custom'].includes(data?.type))state.type=data.type;
    if(typeof data?.expression==='string')state.expression=data.expression;
    for(const key of['a','b','c','r'])if(Number.isFinite(data?.[key])){const min=key==='r'?.5:key==='c'?-2:-1,max=key==='r'||key==='c'?2:1;state[key]=Math.max(min,Math.min(max,Math.round(data[key]*20)/20));}
    compileExpression();example=matchingExample();sync();
  }
  q('ml-geometry-type').addEventListener('change',event=>{state.type=event.target.value;sync();onChange();});
  q('ml-geo-example').addEventListener('change',event=>{
    example=Object.prototype.hasOwnProperty.call(examples,event.target.value)?event.target.value:'custom';
    const item=examples[example];
    if(item){state.type='custom';state.expression=item.expression;state.a=item.a??0.5;state.b=item.b??-0.5;state.c=0;compileExpression();}
    sync();onChange();
  });
  for(const key of['a','b','c','r'])q('ml-geo-'+key).addEventListener('input',event=>{state[key]=Number(event.target.value);if(key==='a'||key==='b')example='custom';sync();onChange();});
  q('ml-geo-expression').addEventListener('input',event=>{state.expression=event.target.value;example='custom';compiled=null;expressionError='';pending=true;sync();onChange();});
  const apply=()=>{compileExpression();sync();onChange();};
  q('ml-geo-draw').addEventListener('click',apply);
  q('ml-geo-expression').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();apply();}});
  new ResizeObserver(drawCut).observe(q('ml-geo-cut'));
  restore(initial);
  return {
    restore,
    context:()=>({...state,formula:state.type==='sphere'?'x²+y²+z²=r²':state.type==='custom'?'z='+state.expression:'z=a*x²+b*y²',expressionValid:state.type==='custom'?Boolean(compiled):null,plane:'y='+state.c,section:section().equation,domain:state.type==='sphere'?null:{x:[-2,2],y:[-2,2],z:[-8,8]},rendering:'数值采样；未定义值、超界值和无法解析的陡峭间断留空'}),
    scene() {
      const faces=[],lines=[],dots=[],labels=[],data=section();
      let zlo,zhi,extent;
      if(state.type!=='sphere') {
        extent=2;const heights=[0];
        const resolution=state.type==='custom'?32:20,d=4/resolution;
        const grid=Array.from({length:resolution+1},(_,i)=>Array.from({length:resolution+1},(_,j)=>point(-2+i*d,-2+j*d)));
        for(const row of grid)for(const p of row)if(p)heights.push(p[2]);
        zlo=Math.min(...heights);zhi=Math.max(...heights);
        for(let i=0;i<resolution;i++)for(let j=0;j<resolution;j++){
          const ps=[grid[i][j],grid[i+1][j],grid[i+1][j+1],grid[i][j+1]];
          if(ps.every(Boolean)&&ps.every((p,k)=>safeEdge(p,ps[(k+1)%4]))&&safeEdge(ps[0],ps[2])&&safeEdge(ps[1],ps[3]))faces.push({points:ps,color:'s1',opacity:.20});
        }
        for(let i=0;i<=16;i++){
          const t=-2+i/4;
          for(const swapped of[false,true]){
            const points=Array.from({length:81},(_,j)=>{const u=-2+j/20;return swapped?point(u,t):point(t,u);});
            for(const segment of splitCurve(points))lines.push({points:segment,color:'s1',width:.7,opacity:.55});
          }
        }
      } else {
        const r=state.r;extent=r;zlo=-r;zhi=r;
        const p=(theta,phi)=>[r*Math.sin(theta)*Math.cos(phi),r*Math.sin(theta)*Math.sin(phi),r*Math.cos(theta)];
        for(let i=0;i<18;i++)for(let j=0;j<24;j++){const t=Math.PI*i/18,u=2*Math.PI*j/24;faces.push({points:[p(t,u),p(t+Math.PI/18,u),p(t+Math.PI/18,u+Math.PI/12),p(t,u+Math.PI/12)],color:'s1',opacity:.12});}
        for(let i=1;i<12;i++)lines.push({points:Array.from({length:65},(_,j)=>p(Math.PI*i/12,j*Math.PI/32)),color:'s1',width:.7,opacity:.55});
        for(let i=0;i<12;i++)lines.push({points:Array.from({length:41},(_,j)=>p(j*Math.PI/40,i*Math.PI/6)),color:'s1',width:.7,opacity:.55});
      }
      const plane=[[-extent,state.c,zlo-.15],[extent,state.c,zlo-.15],[extent,state.c,zhi+.15],[-extent,state.c,zhi+.15]];
      faces.push({points:plane,color:'s2',opacity:.06});lines.push({points:[...plane,plane[0]],color:'s2',opacity:.4,width:1});
      for(const segment of data.segments)lines.push({points:segment,color:'s2',width:3,overlay:true});
      if(data.points.length===1)dots.push({point:data.points[0],color:'s2',radius:6,label:'切点'});
      const bounds=[[-extent,-Math.max(extent,Math.abs(state.c)),zlo],[extent,Math.max(extent,Math.abs(state.c)),zhi]];
      const empty=state.type==='custom'&&compiled&&!faces.some(face=>face.color==='s1');
      return {faces,lines,dots,labels,bounds,axisExtent:2.2,summary:shape()+' · y = '+fmt(state.c)+' · '+(state.type==='sphere'?data.equation:empty?'当前范围内无可绘制曲面':compiled||state.type==='quadratic'?'高亮曲线为当前截线':'修正表达式后点击绘制曲面')};
    }
  };
};
