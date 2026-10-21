/* Animated dot-matrix Africa map. Illustration only, never live telemetry. */
(function () {
  'use strict';

  var CONFIG = {
    dotSpacing: 9,
    dotRadius: 1.2,
    dotColor: 'rgba(120,170,230,0.45)',
    nodeColor: '#58d9ff',
    nodeGlow: 'rgba(40,190,255,0.78)',
    pulseIntervalMin: 800,
    pulseIntervalMax: 1500,
    pulseDuration: 2600,
    pulseRingCount: 3,
    waveSpeed: 0.00016,
    packetSpeed: 0.00022,
    maxDpr: 2,
    nodes: [
      { name: 'Dakar', x: .205, y: .285 }, { name: 'Casablanca', x: .355, y: .115 },
      { name: 'Tunis', x: .575, y: .145 }, { name: 'Cairo', x: .685, y: .205 },
      { name: 'Lagos', x: .355, y: .385 }, { name: 'Accra', x: .315, y: .405 },
      { name: 'Addis Ababa', x: .685, y: .405 }, { name: 'Nairobi', x: .695, y: .545 },
      { name: 'Kigali', x: .605, y: .555 }, { name: 'Dar es Salaam', x: .725, y: .615 },
      { name: 'Luanda', x: .465, y: .635 }, { name: 'Johannesburg', x: .625, y: .815 },
      { name: 'Cape Town', x: .555, y: .925 }
    ]
  };

  var canvas = document.querySelector('[data-africa-dot-map]');
  var panel = document.querySelector('[data-network-illustration]');
  if (!canvas || !panel) return;
  var ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return;
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var visible = true, raf = 0, width = 0, height = 0, scale = 1, lastPulse = 0;
  var dots = [], pulses = [], packets = [], lastTime = 0;

  /* Normalized outline polygon in the canvas coordinate system. */
  var outline = [
    [.29,.04],[.40,.08],[.49,.07],[.55,.13],[.67,.12],[.75,.20],[.73,.28],
    [.81,.33],[.76,.42],[.71,.47],[.74,.57],[.68,.68],[.64,.79],[.58,.91],
    [.52,.98],[.46,.91],[.42,.80],[.37,.71],[.33,.61],[.27,.52],[.23,.42],
    [.17,.34],[.18,.25],[.23,.18],[.25,.10]
  ];
  function inside(x, y) {
    var hit = false;
    for (var i=0,j=outline.length-1;i<outline.length;j=i++) {
      var a=outline[i], b=outline[j];
      if (((a[1]>y)!==(b[1]>y)) && (x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])) hit=!hit;
    }
    return hit;
  }
  function rebuild() {
    var rect=canvas.getBoundingClientRect();
    width=Math.max(1,rect.width); height=Math.max(1,rect.height);
    scale=Math.min(window.devicePixelRatio||1,CONFIG.maxDpr);
    canvas.width=Math.round(width*scale); canvas.height=Math.round(height*scale);
    ctx.setTransform(scale,0,0,scale,0,0);
    dots=[];
    var spacing=CONFIG.dotSpacing;
    var mapW=Math.min(width*.92,height*.98), mapH=Math.min(height*.98,mapW*1.02);
    var ox=(width-mapW)/2, oy=(height-mapH)/2;
    for(var y=0;y<mapH;y+=spacing) for(var x=0;x<mapW;x+=spacing) {
      var nx=x/mapW, ny=y/mapH;
      if(inside(nx,ny)) dots.push({x:ox+x,y:oy+y,nx:nx,ny:ny,phase:Math.random()*Math.PI*2});
    }
    CONFIG.nodes.forEach(function(n){n.px=ox+n.x*mapW;n.py=oy+n.y*mapH;});
    packets=[];
    for(var p=0;p<7;p++) packets.push({from:p%CONFIG.nodes.length,to:(p*5+4)%CONFIG.nodes.length,t:Math.random(),speed:.00007+Math.random()*.00007});
  }
  function point(n){return {x:n.px,y:n.py};}
  function curve(from,to,t) {
    var a=point(CONFIG.nodes[from]), b=point(CONFIG.nodes[to]);
    var dx=b.x-a.x,dy=b.y-a.y;
    var bend=((from+to)%2?1:-1)*Math.min(32,Math.abs(dx)*.14);
    var cx=(a.x+b.x)/2,cy=(a.y+b.y)/2-bend;
    return {x:(1-t)*(1-t)*a.x+2*(1-t)*t*cx+t*t*b.x,y:(1-t)*(1-t)*a.y+2*(1-t)*t*cy+t*t*b.y};
  }
  function draw(now) {
    if(!visible||document.hidden) { raf=0; return; }
    ctx.clearRect(0,0,width,height);
    if(now-lastPulse>=(CONFIG.pulseIntervalMin+Math.random()*(CONFIG.pulseIntervalMax-CONFIG.pulseIntervalMin))) {
      pulses.push({node:Math.floor(Math.random()*CONFIG.nodes.length),start:now});
      lastPulse=now;
    }
    var wave=((now*CONFIG.waveSpeed)%(width+height))-height;
    dots.forEach(function(d){
      var dist=(d.x+d.y)-wave;
      var glow=Math.max(0,1-Math.abs(dist)/115);
      var shimmer=.78+.22*Math.sin(now*.00045+d.phase);
      ctx.beginPath();ctx.arc(d.x,d.y,CONFIG.dotRadius,0,Math.PI*2);
      ctx.fillStyle='rgba(120,170,230,'+(0.28+glow*.42)*shimmer+')';ctx.fill();
    });
    CONFIG.nodes.forEach(function(n){
      ctx.beginPath();ctx.arc(n.px,n.py,2.1,0,Math.PI*2);
      ctx.shadowColor=CONFIG.nodeGlow;ctx.shadowBlur=11;ctx.fillStyle=CONFIG.nodeColor;ctx.fill();ctx.shadowBlur=0;
    });
    /* Curved, subdued routes and a handful of moving light packets. */
    packets.forEach(function(p){
      var a=point(CONFIG.nodes[p.from]),b=point(CONFIG.nodes[p.to]);
      ctx.beginPath();ctx.moveTo(a.x,a.y);
      var mid=curve(p.from,p.to,.5);ctx.quadraticCurveTo(mid.x*2-(a.x+b.x)/2,mid.y*2-(a.y+b.y)/2,b.x,b.y);
      ctx.strokeStyle='rgba(73,179,239,.12)';ctx.lineWidth=.8;ctx.stroke();
      p.t+=p.speed*(now-(lastTime||now));
      if(p.t>1)p.t=0;
      var pos=curve(p.from,p.to,p.t);
      ctx.beginPath();ctx.arc(pos.x,pos.y,1.65,0,Math.PI*2);ctx.fillStyle='rgba(139,235,255,.9)';ctx.shadowColor=CONFIG.nodeGlow;ctx.shadowBlur=7;ctx.fill();ctx.shadowBlur=0;
    });
    pulses=pulses.filter(function(p){return now-p.start<CONFIG.pulseDuration;});
    pulses.forEach(function(p){
      var n=CONFIG.nodes[p.node],age=now-p.start;
      for(var r=0;r<CONFIG.pulseRingCount;r++){
        var phase=(age-r*220)/(CONFIG.pulseDuration-r*220);
        if(phase<0||phase>1)continue;
        ctx.beginPath();ctx.arc(n.px,n.py,4+phase*29,0,Math.PI*2);
        ctx.strokeStyle='rgba(77,205,255,'+((1-phase)*.65)+')';ctx.lineWidth=1.2;ctx.shadowColor=CONFIG.nodeGlow;ctx.shadowBlur=7;ctx.stroke();ctx.shadowBlur=0;
      }
    });
    lastTime=now;
    raf=window.requestAnimationFrame(draw);
  }
  function start(){if(!reduceMotion&&visible&&!document.hidden&&!raf)raf=window.requestAnimationFrame(draw);else if(reduceMotion)drawStatic();}
  function stop(){if(raf)window.cancelAnimationFrame(raf);raf=0;}
  function drawStatic(){
    if(!width||!height)rebuild();
    ctx.clearRect(0,0,width,height);
    dots.forEach(function(d){ctx.beginPath();ctx.arc(d.x,d.y,CONFIG.dotRadius,0,Math.PI*2);ctx.fillStyle=CONFIG.dotColor;ctx.fill();});
    CONFIG.nodes.forEach(function(n){ctx.beginPath();ctx.arc(n.px,n.py,2.2,0,Math.PI*2);ctx.fillStyle=CONFIG.nodeColor;ctx.fill();});
  }
  function resize(){stop();rebuild();if(reduceMotion)drawStatic();else start();}
  if('IntersectionObserver' in window) {
    new IntersectionObserver(function(entries){visible=entries[0].isIntersecting;if(visible)start();else stop();},{threshold:.05}).observe(panel);
  }
  document.addEventListener('visibilitychange',function(){if(document.hidden)stop();else start();});
  window.addEventListener('resize',resize,{passive:true});
  if('ResizeObserver' in window)new ResizeObserver(resize).observe(canvas);
  rebuild();if(reduceMotion)drawStatic();else start();
}());