/* Homepage-only motion and interactions. No scan backend behavior is duplicated here. */
(function () {
  'use strict';

  var motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var reduceMotion = !!(motionQuery && motionQuery.matches);

  /* DotField: deterministic per-dot values, device-pixel snapping, smooth travelling wave. */
  (function initDotField(){var c=document.querySelector('[data-dot-field]');if(!c||!c.getContext)return;var x=c.getContext('2d',{alpha:true});if(!x)return;var w=0,h=0,dpr=1,cols=0,rows=0,gap=12,p=new Float32Array(0),f=new Float32Array(0),hot=new Uint8Array(0),running=!document.hidden,view=true,last=0,raf=0,debounce=0;
function hash(a,b,s){var n=(Math.imul((a+1)^0x9e3779b9,0x85ebca6b)+Math.imul((b+1)^0xc2b2ae35,0x27d4eb2f)+Math.imul(s+1,0x165667b1))|0;n^=n>>>16;n=Math.imul(n,0x7feb352d);n^=n>>>15;n=Math.imul(n,0x846ca68b);n^=n>>>16;return(n>>>0)/4294967296}
function sm(t){t=Math.max(0,Math.min(1,t));return t*t*(3-2*t)}function noise(a,b){var i=Math.floor(a),j=Math.floor(b),u=sm(a-i),v=sm(b-j),a0=hash(i,j,1),a1=hash(i+1,j,1),b0=hash(i,j+1,1),b1=hash(i+1,j+1,1),top=a0+(a1-a0)*u,bot=b0+(b1-b0)*u;return top+(bot-top)*v}
function snap(v){return(Math.round(v*dpr-.5)+.5)/dpr}function build(nc,nr){var pp=new Float32Array(nc*nr),ff=new Float32Array(nc*nr),hh=new Uint8Array(nc*nr);for(var r=0;r<nr;r++)for(var col=0;col<nc;col++){var i=r*nc+col;pp[i]=hash(col,r,11)*Math.PI*2;ff[i]=1/(3+hash(col,r,23)*4);hh[i]=hash(col,r,37)<.06?1:0}cols=nc;rows=nr;p=pp;f=ff;hot=hh}
function draw(now){var t=now/1000;x.clearRect(0,0,w,h);var cx=w*.5,cy=h*.58,rx=w*.66,ry=h*.62;for(var r=0;r<rows;r++){var y=snap(r*gap+gap*.5);for(var col=0;col<cols;col++){var xx=snap(col*gap+gap*.5),ex=(xx-cx)/rx,ey=(y-cy)/ry,env=1-Math.sqrt(ex*ex+ey*ey);if(env<=0)continue;var wave=sm((noise(xx*.01+t*.02,y*.01)-.2)/.72),i=r*cols+col,tw=.5+.5*Math.sin(t*Math.PI*2*f[i]+p[i]),alpha=Math.pow(env,.8)*wave*(.22+.78*tw)*.9,rad=.8+.8*Math.min(1,wave*env*1.4),color=hot[i]?[156,203,255]:[56,152,220];x.fillStyle='rgba('+color[0]+','+color[1]+','+color[2]+','+alpha.toFixed(4)+')';x.fillRect(xx-rad,y-rad,rad*2,rad*2)}}}
function loop(now){if(!running||!view||reduceMotion){raf=0;return}if(now-last>=1000/(innerWidth<720?24:30)){draw(now);last=now}raf=requestAnimationFrame(loop)}function sync(){if(raf)cancelAnimationFrame(raf);raf=0;if(running&&view&&!reduceMotion)raf=requestAnimationFrame(loop);else draw(performance.now())}
function resize(){var r=c.getBoundingClientRect(),nw=Math.max(1,r.width),nh=Math.max(1,r.height),nd=Math.min(devicePixelRatio||1,2),ng=innerWidth<720?14:12;if(w&&Math.abs(nw-w)<2&&Math.abs(nh-h)<120&&nd===dpr&&ng===gap)return;w=nw;h=nh;dpr=nd;gap=ng;var bw=Math.round(w*dpr),bh=Math.round(h*dpr);if(c.width!==bw)c.width=bw;if(c.height!==bh)c.height=bh;x.setTransform(dpr,0,0,dpr,0,0);var nc=Math.ceil(w/gap)+1,nr=Math.ceil(h/gap)+1;if(nc!==cols||nr!==rows||p.length!==nc*nr)build(nc,nr);draw(performance.now())}
function queue(){clearTimeout(debounce);debounce=setTimeout(function(){debounce=0;resize()},150)}function watchDpr(){if(!matchMedia)return;var m=matchMedia('(resolution: '+(devicePixelRatio||1)+'dppx)'),fn=function(){m.removeEventListener?m.removeEventListener('change',fn):m.removeListener(fn);resize();watchDpr()};m.addEventListener?m.addEventListener('change',fn,{once:true}):m.addListener(fn)}
if('IntersectionObserver'in window){var io=new IntersectionObserver(function(es){view=!!(es[0]&&es[0].isIntersecting);sync()},{rootMargin:'80px 0px'});io.observe(c.closest('.al-hero')||c)}document.addEventListener('visibilitychange',function(){running=!document.hidden;sync()});if('ResizeObserver'in window){var ro=new ResizeObserver(queue);ro.observe(c)}else addEventListener('resize',queue,{passive:true});addEventListener('resize',function(){if(Math.min(devicePixelRatio||1,2)!==dpr)queue()},{passive:true});resize();watchDpr();if(!reduceMotion&&running&&view)sync();if(new URLSearchParams(location.search).has('dotfield-test'))window.__AL_DOTFIELD_TEST_HOOK__={resize:resize,snapshot:function(){return JSON.stringify({phaseBytes:Array.from(new Uint8Array(p.buffer)),frequencyBytes:Array.from(new Uint8Array(f.buffer)),highlightBytes:Array.from(hot),cols:cols,rows:rows,gap:gap})}}
  }());

  /* Africa map: local Natural Earth geometry, country highlights only, no latency values. */
  (function initAfricaDotMap(){var c=document.querySelector('[data-africa-dot-map]');if(!c||!c.getContext)return;var ctx=c.getContext('2d',{alpha:true}),label=document.querySelector('[data-probe-country]');if(!ctx||!label)return;var names=['Kenya','Nigeria','South Africa','Egypt','Ghana','Morocco','Tanzania','Uganda','Senegal'],coords={'Kenya':[36.82,-1.29],'Nigeria':[3.38,6.52],'South Africa':[28.05,-26.20],'Egypt':[31.24,30.04],'Ghana':[-.19,5.60],'Morocco':[-7.59,33.57],'Tanzania':[39.21,-6.79],'Uganda':[32.58,.35],'Senegal':[-17.47,14.72]},iso=new Set(['KEN','NGA','ZAF','EGY','GHA','MAR','TZA','UGA','SEN']),features=[],probeMaskData=null,landMaskData=null,hotMaskData=null,probeMaskWidth=0,maskHeight=0,w=0,h=0,dpr=1,active=0,timer=0,raf=0,lastDraw=0,hover=false,inView=true,reduced=!!(matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches);
function proj(lon,lat){var px=w*.045,py=h*.06;return[px+(lon+20)/74*(w-px*2),py+(37-lat)/75*(h-py*2)]}function polys(g){return g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[]}function pathFor(path,poly){poly.forEach(function(r){r.forEach(function(pt,i){var p=proj(pt[0],pt[1]);if(!i)path.moveTo(p[0],p[1]);else path.lineTo(p[0],p[1])});path.closePath()})}
function buildMasks(){if(!features.length||!w||!h)return;var mask=document.createElement('canvas');mask.width=Math.ceil(w);mask.height=Math.ceil(h);var m=mask.getContext('2d',{willReadFrequently:true}),hm=document.createElement('canvas');hm.width=mask.width;hm.height=mask.height;var hctx=hm.getContext('2d',{willReadFrequently:true});m.fillStyle=hctx.fillStyle='#fff';features.forEach(function(f){polys(f.geometry).forEach(function(poly){var p=new Path2D();pathFor(p,poly);m.fill(p,'evenodd');if(iso.has(f.properties.iso_a3))hctx.fill(p,'evenodd')})});landMaskData=m.getImageData(0,0,mask.width,mask.height).data;hotMaskData=hctx.getImageData(0,0,hm.width,hm.height).data;probeMaskData=hotMaskData;probeMaskWidth=hm.width;maskHeight=mask.height}
function draw(){if(!landMaskData||!hotMaskData||!w||!h)return;ctx.clearRect(0,0,w,h);var step=10,t=performance.now()/1000,loc=coords[names[active]],marker=proj(loc[0],loc[1]),ring=5+(reduced?0:(t%3)/3*8);for(var y=step/2;y<h;y+=step)for(var x=step/2;x<w;x+=step){var i=(Math.floor(y)*probeMaskWidth+Math.floor(x))*4;if(landMaskData[i+3]<20)continue;var isHot=hotMaskData[i+3]>20,onRing=Math.abs(Math.hypot(x-marker[0],y-marker[1])-ring)<2;ctx.fillStyle='rgba(56,152,220,'+(onRing?1:(isHot?0.94:0.32))+')';ctx.fillRect(x-(isHot?1.45:1.05),y-(isHot?1.45:1.05),isHot?2.9:2.1,isHot?2.9:2.1)}ctx.beginPath();ctx.arc(marker[0],marker[1],3.2,0,Math.PI*2);ctx.fillStyle='#9ccBff';ctx.fill();ctx.beginPath();ctx.arc(marker[0],marker[1],7.5,0,Math.PI*2);ctx.strokeStyle='rgba(156,203,255,.9)';ctx.lineWidth=1.2;ctx.stroke()}
function size(){var r=c.getBoundingClientRect();w=Math.max(1,r.width);h=Math.max(1,r.height);dpr=Math.min(devicePixelRatio||1,2);c.width=Math.round(w*dpr);c.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);buildMasks();draw()}function setLabel(){label.textContent=reduced?'All nine probe countries highlighted':names[active]}function stop(){clearInterval(timer);timer=0;if(raf)cancelAnimationFrame(raf);raf=0}function start(){stop();if(reduced||document.hidden||hover||!inView){setLabel();draw();return}timer=setInterval(function(){active=(active+1)%names.length;setLabel();draw()},3000);raf=requestAnimationFrame(function pulse(now){if(document.hidden||hover||!inView||reduced){raf=0;return}if(now-lastDraw>=1000/30){draw();lastDraw=now}raf=requestAnimationFrame(pulse)})}
function hit(e){var r=c.getBoundingClientRect(),x=Math.floor(e.clientX-r.left),y=Math.floor(e.clientY-r.top);if(!probeMaskData||x<0||y<0||x>=probeMaskWidth||y>=h)return false;return probeMaskData[(y*probeMaskWidth+x)*4+3]>20}
c.addEventListener('pointermove',function(e){var yes=hit(e);c.title=yes?'Probe country':'';c.setAttribute('aria-label',yes?'Probe country':'Dot map of Africa showing community probe countries.')});c.addEventListener('pointerdown',function(e){if(hit(e)){c.title='Probe country';label.textContent='Probe country'}});c.addEventListener('pointerenter',function(){hover=true;stop()});c.addEventListener('pointerleave',function(){hover=false;start()});document.addEventListener('visibilitychange',function(){if(document.hidden)stop();else start()});if('IntersectionObserver'in window){var io=new IntersectionObserver(function(es){inView=!!(es[0]&&es[0].isIntersecting);if(inView)start();else stop()});io.observe(c)}addEventListener('resize',function(){setTimeout(size,120)},{passive:true});fetch('/data/africa-110m.geojson').then(function(r){if(!r.ok)throw Error('Map data unavailable');return r.json()}).then(function(d){features=d.features||[];size();setLabel();start()}).catch(function(){c.setAttribute('aria-label','Africa dot map unavailable; see probe country list.');label.textContent='Map unavailable'})
  }());

  /* Eight confirmed words, reference interval and fade timing. */
  (function initRotatingWord() {
    var element = document.querySelector('[data-rotating-word]');
    if (!element) return;
    var words = ['AI-Built', 'WordPress', 'e-commerce', 'fintech', 'mobile-first', 'SaaS', 'agency', 'Next.js'];
    var index = 0, timer = 0, transition = 0;
    function stop() {
      if (timer) window.clearInterval(timer);
      if (transition) window.clearTimeout(transition);
      timer = 0;
      transition = 0;
    }
    function start() {
      stop();
      if (reduceMotion || document.hidden) return;
      timer = window.setInterval(function () {
        element.classList.add('al-is-out');
        transition = window.setTimeout(function () {
          index = (index + 1) % words.length;
          element.textContent = words[index];
          element.setAttribute('aria-label', words[index]);
          element.classList.remove('al-is-out');
          transition = 0;
        }, 450);
      }, 2600);
    }
    document.addEventListener('visibilitychange', start);
    start();
  }());

  /* Keep the scan link contract intact: /scan?url=...; device selection remains on /scan. */
  (function initUrlForm() {
    var form = document.querySelector('[data-url-form]');
    var input = document.getElementById('homepage-url');
    var help = document.querySelector('[data-form-help]');
    var button = form && form.querySelector('button[type="submit"]');
    if (!form || !input || !button) return;
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var raw = input.value.trim();
      if (!raw) {
        input.setCustomValidity('Enter a website or API URL.');
        input.reportValidity();
        return;
      }
      input.setCustomValidity('');
      var candidate = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(raw) ? raw : 'https://' + raw;
      var parsed;
      try { parsed = new URL(candidate); } catch (_) {
        input.setCustomValidity('Enter a valid public URL, such as example.com.');
        input.reportValidity();
        return;
      }
      if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.hostname.indexOf('.') === -1) {
        input.setCustomValidity('Enter a valid public website or API URL.');
        input.reportValidity();
        return;
      }
      if (parsed.username || parsed.password) {
        input.setCustomValidity('URLs containing a username or password are not supported.');
        input.reportValidity();
        return;
      }
      if (help) help.textContent = 'Opening the scan page…';
      button.disabled = true;
      button.textContent = 'Opening…';
      window.location.assign('/scan?url=' + encodeURIComponent(parsed.href));
    });
    input.addEventListener('input', function () { input.setCustomValidity(''); });
  }());

  /* Desktop tab pattern with a single-open mobile accordion. */
  (function initCapabilityTabs(){var items=Array.prototype.slice.call(document.querySelectorAll('.al-capability-item'));if(!items.length)return;var media=matchMedia('(max-width: 899px)');
function activate(item,focus){items.forEach(function(i){var on=i===item,b=i.querySelector('.al-capability-tab'),p=i.querySelector('.al-capability-panel');b.classList.toggle('is-active',on);b.setAttribute('aria-selected',String(on));b.setAttribute('aria-expanded',String(on));b.tabIndex=on?0:-1;b.querySelector('.al-accordion-icon').textContent=on?'−':'+';p.hidden=!on});if(focus)item.querySelector('.al-capability-tab').focus()}
function mode(){var mobile=media.matches,list=document.querySelector('.al-capability-list');list.setAttribute('role',mobile?'group':'tablist');items.forEach(function(i){var b=i.querySelector('.al-capability-tab'),p=i.querySelector('.al-capability-panel');b.setAttribute('role',mobile?'button':'tab');p.setAttribute('role',mobile?'region':'tabpanel')});if(!mobile&&!items.some(function(i){return!i.querySelector('.al-capability-panel').hidden}))activate(items[0],false)}
items.forEach(function(i,index){var b=i.querySelector('.al-capability-tab');b.addEventListener('click',function(){if(media.matches&&!i.querySelector('.al-capability-panel').hidden){items.forEach(function(j){var p=j.querySelector('.al-capability-panel'),x=j.querySelector('.al-capability-tab');p.hidden=true;x.setAttribute('aria-expanded','false');x.setAttribute('aria-selected','false');x.classList.remove('is-active');x.tabIndex=-1;x.querySelector('.al-accordion-icon').textContent='+'})}else activate(i,false)});b.addEventListener('keydown',function(e){if(media.matches)return;var n=index;if(e.key==='ArrowRight'||e.key==='ArrowDown')n=(index+1)%items.length;else if(e.key==='ArrowLeft'||e.key==='ArrowUp')n=(index-1+items.length)%items.length;else if(e.key==='Home')n=0;else if(e.key==='End')n=items.length-1;else return;e.preventDefault();activate(items[n],true)})});media.addEventListener?media.addEventListener('change',mode):media.addListener(mode);mode();activate(items[0],false)
  }());

  /* Small, self-contained mobile menu; no legacy homepage header scripts are needed. */
  (function initMenu() {
    var button = document.querySelector('.al-menu-toggle');
    var menu = document.getElementById('mobile-menu');
    if (!button || !menu) return;
    button.addEventListener('click', function () {
      var open = button.getAttribute('aria-expanded') !== 'true';
      button.setAttribute('aria-expanded', String(open));
      button.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      menu.hidden = !open;
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !menu.hidden) {
        menu.hidden = true;
        button.setAttribute('aria-expanded', 'false');
        button.setAttribute('aria-label', 'Open menu');
        button.focus();
      }
    });
    document.addEventListener('click', function (event) {
      if (menu.hidden || menu.contains(event.target) || button.contains(event.target)) return;
      menu.hidden = true;
      button.setAttribute('aria-expanded', 'false');
      button.setAttribute('aria-label', 'Open menu');
    });
  }());
  /* Homepage FAQ: the .open class is the single source of truth for answer expansion. */
  (function initFaq() {
    var items = Array.prototype.slice.call(document.querySelectorAll('.faq-section .faq-item'));
    items.forEach(function (item) {
      var question = item.querySelector('.faq-question');
      var answer = item.querySelector('.faq-answer');
      if (!question || !answer) return;
      question.setAttribute('aria-expanded', item.classList.contains('open') ? 'true' : 'false');
      question.addEventListener('click', function () {
        var open = !item.classList.contains('open');
        item.classList.toggle('open', open);
        question.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    });
  }());

}());
