import { hv, aStar, nearest } from './path.js';
import { loadOSM } from './osm.js';
import { Pedestrian, Vehicle } from './agents.js';

export class World {
  constructor(mapView){
    this.mapView = mapView;
    this.params = {
      weather: 'clear',
      timeOfDay: 12,
      simSpeed: 1.0,
      viewDist: 140,
      humanIQ: 0.75,
      carIQ: 0.85,
      peopleCount: 120,
      carsCount: 80
    };
    this.running = false;
    this.t0 = performance.now();

    this.osm = null;
    this.road = { nodes: [], adj: new Map(), edges: [], order: [] };
    this.foot = { nodes: [], adj: new Map(), edges: [], order: [] };

    this.people = [];
    this.cars = [];
    this.signals = [];
    this.billboards = [];

    this._secAccum = 0;
  }

  async loadDistrict(){
    const notice = document.getElementById('notice');
    if (notice){ notice.classList.remove('show'); notice.textContent=''; }

    const center = [44.8488, 65.5059];
    const halfLat = 0.0040, halfLng = 0.0060;
    const bbox = [center[0]-halfLat, center[1]-halfLng, center[0]+halfLat, center[1]+halfLng];
    this.mapView.fit(L.latLngBounds([bbox[0],bbox[1]], [bbox[2],bbox[3]]));

    try{
      this.osm = await loadOSM(bbox);
    }catch(err){
      console.warn('Overpass failed, switching to offline snapshot', err);
      if (notice){ notice.textContent = 'Overpass недоступен — включён офлайн-снимок района'; notice.classList.add('show'); }
      this.osm = await (await fetch('data/graph_magnum.json')).json();
      this._fromOffline = true;
    }

    this.mapView.layers.roads.clearLayers();
    this.mapView.layers.foot.clearLayers();
    this.mapView.layers.buildings.clearLayers();
    const blds = this.osm.buildings || [];
    for (const poly of blds){ this.mapView.building(poly).addTo(this.mapView.layers.buildings); }
    for (const w of this.osm.ways){
      if (w.type !== 'road') continue;
      for (let i=1;i<w.nodes.length;i++){
        const a = w.nodes[i-1], b = w.nodes[i];
        const poly = (w.foot && !w.car) ? this.mapView.foot(a,b) : this.mapView.road(a,b, w.car ? '#60a5fa' : '#22c55e');
        poly.addTo(w.foot && !w.car ? this.mapView.layers.foot : this.mapView.layers.roads);
      }
    }

    this._buildGraphs();

    const nodeGet = (x)=> (this.osm.nodes instanceof Map ? this.osm.nodes.get(x) : this.osm.nodes[x]);
    const sigIds = this.osm.signals || [];
    this.signals = sigIds.map(id => nodeGet(id)).filter(Boolean);
    this.mapView.layers.traffic.clearLayers();
    for (const s of this.signals){
      L.circleMarker(s, {radius:6, color:'#fff', fillColor:'#22c55e', fillOpacity:.85})
        .addTo(this.mapView.layers.traffic).bindTooltip('🚦');
    }

    this.spawn();
  }

  _buildGraphs(){
    const nodeIndex = new Map(); const roadNodes = []; const roadAdj = new Map();
    const footIndex = new Map(); const footNodes = []; const footAdj = new Map();
    const idx = (map,arr,pt)=>{
      const key = pt.lat.toFixed(6)+','+pt.lng.toFixed(6);
      if (map.has(key)) return map.get(key);
      const i = arr.length; arr.push({lat:pt.lat, lng:pt.lng}); map.set(key,i); return i;
    };
    for (const w of this.osm.ways){
      if (w.type !== 'road') continue;
      if (w.car){
        for (let i=1;i<w.nodes.length;i++){
          const a=w.nodes[i-1], b=w.nodes[i];
          const ia=idx(nodeIndex, roadNodes, a), ib=idx(nodeIndex, roadNodes, b);
          if (!roadAdj.has(ia)) roadAdj.set(ia, []);
          roadAdj.get(ia).push(ib);
          if (!w.oneway){
            if (!roadAdj.has(ib)) roadAdj.set(ib, []);
            roadAdj.get(ib).push(ia);
          }
        }
      }
      if (w.foot){
        for (let i=1;i<w.nodes.length;i++){
          const a=w.nodes[i-1], b=w.nodes[i];
          const ia=idx(footIndex, footNodes, a), ib=idx(footIndex, footNodes, b);
          if (!footAdj.has(ia)) footAdj.set(ia, []);
          footAdj.get(ia).push(ib);
          if (!footAdj.has(ib)) footAdj.set(ib, []);
          footAdj.get(ib).push(ia);
        }
      }
    }
    const roadEdges = []; for (const [a,bs] of roadAdj){ for (const b of bs){ if (a < b) roadEdges.push([a,b]); }}
    const footEdges = []; for (const [a,bs] of footAdj){ for (const b of bs){ if (a < b) footEdges.push([a,b]); }}

    const orderByCentroid = (edges,nodes)=> edges
      .map((e,idx)=>{ const a=nodes[e[0]], b=nodes[e[1]]; return {idx, cx:(a.lng+b.lng)/2, cy:(a.lat+b.lat)/2}; })
      .sort((p,q)=> p.cx===q.cx ? (p.cy-q.cy) : (p.cx-q.cx))
      .map(o=>o.idx);

    this.road = { nodes: roadNodes, adj: roadAdj, edges: roadEdges, order: orderByCentroid(roadEdges, roadNodes) };
    // precompute cumulative lengths for weighted sampling
    this._roadCum = [0];
    for (const e of roadEdges){ const a=roadNodes[e[0]], b=roadNodes[e[1]]; const dx=(a.lng-b.lng), dy=(a.lat-b.lat); const len=Math.hypot(dx,dy); this._roadCum.push(this._roadCum[this._roadCum.length-1]+len); }

    this.foot = { nodes: footNodes, adj: footAdj, edges: footEdges, order: orderByCentroid(footEdges, footNodes) };
    this._footCum = [0];
    for (const e of footEdges){ const a=footNodes[e[0]], b=footNodes[e[1]]; const dx=(a.lng-b.lng), dy=(a.lat-b.lat); const len=Math.hypot(dx,dy); this._footCum.push(this._footCum[this._footCum.length-1]+len); }

  }

  // routing helpers
  routeCar(s,g){ return aStar(this.road.nodes, this.road.adj, s, g); }
  routeFoot(s,g){ return aStar(this.foot.nodes, this.foot.adj, s, g); }
  nearCar(p){ return nearest(this.road.nodes, p); }
  nearFoot(p){ return nearest(this.foot.nodes, p); }
  randCarNode(){ return Math.floor(Math.random()*this.road.nodes.length); }
  randFootNode(){ return Math.floor(Math.random()*this.foot.nodes.length); }

  randEdgeStratified(cum,edges,nodes,rank,total){
    const T=cum[cum.length-1];
    const target = T * ((rank+Math.random())/Math.max(1,total));
    // binary search
    let lo=0, hi=cum.length-1; while(lo<hi){ const mid=(lo+hi>>1); if(cum[mid]<target) lo=mid+1; else hi=mid; }
    const ei=Math.max(1,lo)-1; const e=edges[ei]; const a=nodes[e[0]], b=nodes[e[1]]; const t=Math.random();
    return {lat:a.lat+(b.lat-a.lat)*t, lng:a.lng+(b.lng-a.lng)*t};
  }
  randRoadPoint(i=null){
    const idx = (i==null) ? Math.floor(Math.random()*this.road.edges.length) : this.road.order[i % this.road.edges.length];
    const e = this.road.edges[idx];
    const a = this.road.nodes[e[0]], b = this.road.nodes[e[1]];
    const t = Math.random();
    return {lat:a.lat+(b.lat-a.lat)*t, lng:a.lng+(b.lng-a.lng)*t};
  }
  randFootPoint(i=null){
    const idx = (i==null) ? Math.floor(Math.random()*this.foot.edges.length) : this.foot.order[i % this.foot.edges.length];
    const e = this.foot.edges[idx];
    const a = this.foot.nodes[e[0]], b = this.foot.nodes[e[1]];
    const t = Math.random();
    return {lat:a.lat+(b.lat-a.lat)*t, lng:a.lng+(b.lng-a.lng)*t};
  }
  trafficLightAt(pt){ return this.signals.find(s=>hv(s,pt)<6); }

  // agents
  spawn(){
    this.people.forEach(p=>p.marker.remove());
    this.cars.forEach(c=>c.marker.remove());
    this.people=[]; this.cars=[];

    let pid=1, cid=1;
    const pjitter=1e-5, cjitter=1e-5;

    for(let i=0;i<this.params.peopleCount;i++){
      const pos=this.randEdgeStratified(this._footCum, this.foot.edges, this.foot.nodes, i, this.params.peopleCount);
      const ped=new Pedestrian(this,{lat:pos.lat+(Math.random()-0.5)*1e-5, lng:pos.lng+(Math.random()-0.5)*1e-5}, this.params.humanIQ);
      ped.id='P-'+String(pid++).padStart(3,'0');
      this.people.push(ped);
    }
    for(let i=0;i<this.params.carsCount;i++){
      const pos=this.randEdgeStratified(this._roadCum, this.road.edges, this.road.nodes, i, this.params.carsCount);
      const car=new Vehicle(this,{lat:pos.lat+(Math.random()-0.5)*1e-5, lng:pos.lng+(Math.random()-0.5)*1e-5}, this.params.carIQ);
      car.id='C-'+String(cid++).padStart(3,'0');
      this.cars.push(car);
    }

    for(const bb of this.billboards){ bb._seenFrame=new Set(); bb._seenSec=new Set(); bb._ever=new Set(); bb._secHistory=[]; bb.seenTotal=0; bb.views=0; }
    this._secAccum=0;
  }

  setRunning(v){ this.running=v; }
  tick(){ const now=performance.now(); const dt=(now-this.t0)/1000; this.t0=now; return dt; }

  penalties(){
    const t=this.params.timeOfDay, w=this.params.weather;
    let night=1.0;
    if(t<6||t>21) night=.7;
    else if(t<8||t>19) night=.85;
    const p = { speed:1.0, vis:1.0*night, friction:1.0 };
    if(w==='rain'){ p.speed=.88; p.vis*=.85; p.friction=.85; }
    if(w==='snow'){ p.speed=.78; p.vis*=.7;  p.friction=.7;  }
    if(w==='fog'){  p.speed=.9;  p.vis*=.55; p.friction=.95; }
    if(w==='cloudy'){ p.vis*=.95; }
    return p;
  }

  step(dt){
    if(!this.running) return;
    const s = dt * this.params.simSpeed, pen = this.penalties();
    this.people.forEach(p=>p.update(s,pen));
    this.cars.forEach(c=>c.update(s,pen));

    for(const bb of this.billboards){
      if(!bb._seenFrame) bb._seenFrame=new Set();
      if(!bb._seenSec) bb._seenSec=new Set();
      if(!bb._ever) bb._ever=new Set();
      let seenTick=0;
      for(const p of this.people){ if(this._sees(p,bb)){ bb._seenFrame.add(p.id); bb._seenSec.add(p.id); bb._ever.add(p.id); seenTick++; } }
      for(const c of this.cars){ if(this._sees(c,bb)){ bb._seenFrame.add(c.id); bb._seenSec.add(c.id); bb._ever.add(c.id); seenTick++; } }
      bb.views=(bb.views||0)*0.85+seenTick*0.15;
      if(bb.tooltip){ try{ bb.tooltip.setContent(`📣 ${bb.id}<br>тик: ${Math.round(bb.views||0)}`);}catch(e){} }
      bb._seenFrame.clear();
    }

    this._secAccum=(this._secAccum||0)+dt;
    if(this._secAccum>=1.0){
      this._secAccum=0;
      for(const bb of this.billboards){
        const secCount=bb._seenSec.size;
        bb._secHistory=(bb._secHistory||[]);
        bb._secHistory.push(secCount);
        if(bb._secHistory.length>60) bb._secHistory.shift();
        bb.seenTotal=bb._ever.size;
        bb._seenSec.clear();
      }
    }
  }

  _sees(agent, bb){
    const d = hv(agent.pos, bb.pos);
    const visF = this.penalties().vis;
    const effR = bb.radius * (0.7 + 0.6*visF);
    if (d > effR) return false;

    let angleOk = true;
    if (typeof agent.heading === 'number'){
      const br = (Math.atan2(
        Math.sin((bb.pos.lng-agent.pos.lng)*Math.PI/180)*Math.cos(bb.pos.lat*Math.PI/180),
        Math.cos(agent.pos.lat*Math.PI/180)*Math.sin(bb.pos.lat*Math.PI/180) -
        Math.sin(agent.pos.lat*Math.PI/180)*Math.cos(bb.pos.lat*Math.PI/180)*
        Math.cos((bb.pos.lng-agent.pos.lng)*Math.PI/180)
      )*180/Math.PI+360)%360;
      const diff = Math.abs(((br-agent.heading+540)%360)-180);
      angleOk = diff <= (bb.fov/2);
    }
    if (!angleOk) return false;

    let p = 0.6*visF + 0.3;
    if ('v' in agent){
      const speed = Math.min(1, agent.v/18);
      p *= (1 - 0.5*speed);
    }
    return Math.random() < p;
  }

  addBillboard(pos, radius, fov){
    const id = `BB-${(this.billboards.length+1).toString().padStart(2,'0')}`;
    const marker = L.circleMarker(pos, { radius:8, color:'#a78bfa', weight:2, fill:true, fillColor:'#a78bfa', fillOpacity:.85 })
      .addTo(this.mapView.layers.billboards);
    const circle = L.circle(pos, { radius, color:'#a78bfa', weight:1, fill:true, fillOpacity:.12 })
      .addTo(this.mapView.layers.billboards);
    const bb = { id, pos, radius, fov, marker, circle, views:0, seenTotal:0, _seenFrame:new Set(), _seenSec:new Set(), _ever:new Set(), _secHistory:[] };
    try{ bb.tooltip = marker.bindTooltip('...'); }catch(e){ bb.tooltip = null; }
    this.billboards.push(bb);
    return bb;
  }

  clearBillboards(){
    this.mapView.layers.billboards.clearLayers();
    this.billboards = [];
  }
}
