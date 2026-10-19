(() => {
  const countries = {
    'Kenya':[.69,.52], 'Tanzania':[.68,.61], 'Uganda':[.66,.49], 'Nigeria':[.48,.43],
    'Ghana':[.45,.48], 'Senegal':[.38,.39], 'Morocco':[.43,.24], 'Egypt':[.61,.27],
    'South Africa':[.61,.83], 'Ethiopia':[.68,.39], 'Rwanda':[.65,.55], 'Zambia':[.61,.66],
    'Zimbabwe':[.64,.73], 'Botswana':[.59,.75], 'Namibia':[.54,.73], 'Angola':[.53,.62],
    'Cameroon':[.52,.49], 'Côte d’Ivoire':[.42,.49], 'Ivory Coast':[.42,.49], 'Algeria':[.50,.25],
    'Tunisia':[.53,.21], 'Libya':[.57,.26], 'DR Congo':[.57,.54], 'Democratic Republic of the Congo':[.57,.54]
  };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function enhance() {
    const table = document.getElementById('africa-table');
    const section = table?.closest('.report-section');
    const rows = [...(table?.querySelectorAll('tr') || [])].map(row => {
      const cells = [...row.querySelectorAll('td')];
      if (cells.length < 4) return null;
      const country = cells[0].textContent.trim();
      const valueText = cells[2].textContent.trim();
      const status = cells[3].textContent.trim().toLowerCase();
      const match = valueText.match(/[\d.]+/);
      const value = status === 'measured' && match ? Number(match[0]) : null;
      return {country,value,status: value === null ? 'unavailable':'measured'};
    }).filter(Boolean);
    if (!section || !rows.length || section.querySelector('.report-evidence-grid')) return;
    const measured = rows.filter(r => r.value !== null);
    const max = Math.max(1,...measured.map(r => r.value));
    const sorted = [...rows].sort((a,b) => (a.value ?? Infinity)-(b.value ?? Infinity));
    const barRows = sorted.map(r => '<div class="latency-bar-row"><span class="latency-bar-label" title="'+esc(r.country)+'">'+esc(r.country)+'</span><div class="latency-bar-track" aria-label="'+esc(r.country)+' latency">'+(r.value===null?'<div class="latency-bar-fill is-unavailable" style="width:100%"></div>':'<div class="latency-bar-fill" style="width:'+Math.max(2,r.value/max*100)+'%"></div>')+'</div><span class="latency-bar-value">'+(r.value===null?'N/A':esc(Math.round(r.value))+' ms')+'</span></div>').join('');
    const dots = rows.filter(r => countries[r.country]).map(r => {
      const [x,y]=countries[r.country];
      return '<circle class="map-dot '+(r.value===null?'':'measured')+'" cx="'+(40+x*260)+'" cy="'+(20+y*260)+'" r="5"><title>'+esc(r.country)+': '+(r.value===null?'Unavailable':Math.round(r.value)+' ms RTT')+'</title></circle>';
    }).join('');
    const grid = document.createElement('div');
    grid.className = 'report-evidence-grid';
    grid.innerHTML = '<div class="report-evidence-card"><h3>Observed round-trip time</h3><p>Ping RTT from probes that returned a completed result. Missing probes are shown as unavailable, not zero.</p><div class="latency-bars">'+barRows+'</div></div><div class="report-evidence-card"><h3>African probe coverage</h3><p>'+measured.length+' of '+rows.length+' listed locations returned a measured result for this scan.</p><svg class="africa-map" viewBox="0 0 340 320" role="img" aria-label="Schematic Africa coverage map showing locations with completed measurements"><path class="map-land" d="M112 25 L150 12 L190 25 L220 54 L250 75 L269 107 L257 139 L240 155 L225 184 L209 211 L190 244 L166 285 L146 304 L128 284 L119 249 L103 218 L82 195 L65 168 L48 143 L45 113 L60 86 L76 56 Z"/><path class="map-land" d="M211 17 L236 10 L249 23 L238 36 L218 34 Z"/>'+dots+'</svg><div class="map-legend"><span><i class="map-key"></i>Measured</span><span><i class="map-key unavailable"></i>Unavailable</span></div><div class="report-method-note">Schematic coverage illustration, not a routing map. Probe availability changes over time; measurements are point-in-time observations, not country-wide or ISP-wide averages.</div></div>';
    section.append(grid);
  }
  const watch = () => {
    const table = document.getElementById('africa-table');
    if (!table) return;
    new MutationObserver(enhance).observe(table,{childList:true,subtree:true,characterData:true});
    enhance();
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',watch,{once:true});else watch();
})();
