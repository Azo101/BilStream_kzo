
export class MapView{
  constructor(el){
    this.map = L.map(el,{zoomControl:true,minZoom:15,maxZoom:19});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; OpenStreetMap'}).addTo(this.map);
    this.map.setView([44.8488,65.5059],16);
    this.layers={
      roads:L.layerGroup().addTo(this.map),
      foot:L.layerGroup().addTo(this.map),
      buildings:L.layerGroup().addTo(this.map),
      traffic:L.layerGroup().addTo(this.map),
      agents:L.layerGroup().addTo(this.map),
      billboards:L.layerGroup().addTo(this.map)
    };
  }
  fit(bounds){ this.map.fitBounds(bounds,{maxZoom:17}); this.map.setMaxBounds(bounds.pad(0.2)); }
  road(a,b,col='#60a5fa'){ return L.polyline([a,b],{color:col,weight:3,opacity:.7}); }
  foot(a,b){ return L.polyline([a,b],{color:'#22c55e',weight:2,opacity:.7,dashArray:'6 6'}); }
  building(coords){ return L.polygon(coords,{color:'#94a3b8',weight:1,fill:true,fillOpacity:.15}); }
  person(ll){ return L.circleMarker(ll,{radius:5,color:'#22c55e',fill:true,fillColor:'#22c55e',fillOpacity:.9, weight:2}); }
  car(ll){ return L.circleMarker(ll,{radius:5,color:'#60a5fa',fill:true,fillColor:'#60a5fa',fillOpacity:.9, weight:2}); }
}
