
export function hv(a,b){
  const R=6371000;
  const dLat=(b.lat-a.lat)*Math.PI/180, dLng=(b.lng-a.lng)*Math.PI/180;
  const sLat1=Math.sin(dLat/2), sLng1=Math.sin(dLng/2);
  const x=sLat1*sLat1 + Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*sLng1*sLng1;
  return 2*R*Math.asin(Math.sqrt(x));
}
export function bearing(a,b){
  const y=Math.sin((b.lng-a.lng)*Math.PI/180)*Math.cos(b.lat*Math.PI/180);
  const x=Math.cos(a.lat*Math.PI/180)*Math.sin(b.lat*Math.PI/180)-Math.sin(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.cos((b.lng-a.lng)*Math.PI/180);
  return (Math.atan2(y,x)*180/Math.PI+360)%360;
}
export function metersDelta(m,deg,lat){
  const R=6378137;
  const dLat=m*Math.cos(deg*Math.PI/180)/R;
  const dLng=m*Math.sin(deg*Math.PI/180)/(R*Math.cos(lat*Math.PI/180));
  return { dLat:dLat*180/Math.PI, dLng:dLng*180/Math.PI };
}
export function nearest(nodes,p){
  let bi=0, bd=Infinity;
  for(let i=0;i<nodes.length;i++){ const d=hv(p,nodes[i]); if(d<bd){bd=d; bi=i;} }
  return bi;
}
export function aStar(nodes,adj,s,g){
  const h=(i)=>hv(nodes[i],nodes[g]);
  const open=new Set([s]), came=new Map(), gScore=new Map([[s,0]]), fScore=new Map([[s,h(s)]]);
  while(open.size){
    let cur=null, cf=Infinity;
    for(const i of open){ const v=fScore.get(i)??Infinity; if(v<cf){cf=v; cur=i;}}
    if(cur===g) break;
    open.delete(cur);
    const neigh=adj.get(cur)||[];
    for(const nb of neigh){
      const t = (gScore.get(cur)??Infinity) + hv(nodes[cur],nodes[nb]);
      if(t < (gScore.get(nb)??Infinity)){
        came.set(nb,cur); gScore.set(nb,t); fScore.set(nb,t+h(nb)); open.add(nb);
      }
    }
  }
  const path=[]; let cur=g, it=0;
  if(!came.has(g)){ // fallback: single node
    path.push(s);
  }else{
    while(cur!==undefined && it<10000){ path.push(cur); cur=came.get(cur); if(cur===s){path.push(s); break;} it++; }
  }
  path.reverse();
  return path.map(i=>nodes[i]);
}
