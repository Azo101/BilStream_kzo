
import { hv, bearing, metersDelta } from './path.js';

function projSeg(P,A,B){
  const latScale=111320, lngScale=111320*Math.cos((A.lat+B.lat)/2*Math.PI/180);
  const bx=(B.lng-A.lng)*lngScale, by=(B.lat-A.lat)*latScale;
  const px=(P.lng-A.lng)*lngScale, py=(P.lat-A.lat)*latScale;
  const denom=(bx*bx+by*by)||1e-6;
  let t=(px*bx+py*by)/denom; t=Math.max(0,Math.min(1,t));
  return { t, lat: A.lat + (B.lat-A.lat)*t, lng: A.lng + (B.lng-A.lng)*t };
}

export class Pedestrian{
  constructor(world,pos,iq){
    this.world=world;
    this.pos={lat:pos.lat,lng:pos.lng};
    this.iq=iq;
    this.v = 1.1 + iq*0.6;
    this.heading = 0;
    this.path=[]; this.idx=0;
    this.marker = world.mapView.person(this.pos).addTo(world.mapView.layers.agents);
    this.plan();
  }
  plan(){
    const s=this.world.nearFoot(this.pos);
    const g=this.world.randFootNode();
    this.path=this.world.routeFoot(s,g);
    this.idx=0;
  }
  update(dt,pen){
    if(this.path.length===0){ this.plan(); return; }
    const to = this.path[Math.min(this.idx+1,this.path.length-1)];
    const d=hv(this.pos, to);
    if(d<2){ this.idx++; if(this.idx>=this.path.length-1) this.plan(); return; }
    this.heading = bearing(this.pos, to);
    const speed = this.v * pen.speed;
    const move = Math.min(d, speed*dt);
    const mv=metersDelta(move, this.heading, this.pos.lat);
    this.pos.lat+=mv.dLat; this.pos.lng+=mv.dLng;
    const from = this.path[this.idx];
    const to2  = this.path[Math.min(this.idx+1,this.path.length-1)];
    const pr = projSeg(this.pos, from, to2);
    this.pos.lat = pr.lat; this.pos.lng = pr.lng;
    this.marker.setLatLng(this.pos);
  }
}

export class Vehicle{
  constructor(world,pos,iq){
    this.world=world;
    this.pos={lat:pos.lat,lng:pos.lng};
    this.iq=iq;
    this.v = 7 + iq*5;
    this.heading=0;
    this.path=[]; this.idx=0;
    this.marker = world.mapView.car(this.pos).addTo(world.mapView.layers.agents);
    this.plan();
  }
  plan(){
    const s=this.world.nearCar(this.pos);
    const g=this.world.randCarNode();
    this.path=this.world.routeCar(s,g);
    this.idx=0;
  }
  nearLightPenalty(to){
    const L=this.world.trafficLightAt(to);
    if(!L) return 1.0;
    const d=hv(this.pos, to);
    if(d<10) return 0.5;
    if(d<30) return 0.8;
    return 1.0;
  }
  update(dt,pen){
    if(this.path.length===0){ this.plan(); return; }
    const to=this.path[Math.min(this.idx+1,this.path.length-1)];
    const d=hv(this.pos,to);
    if(d<4){ this.idx++; if(this.idx>=this.path.length-1) this.plan(); return; }
    this.heading=(bearing(this.pos,to));
    let speed=this.v*pen.speed*this.nearLightPenalty(to);
    speed = Math.max(2, speed*0.9);
    const move=Math.min(d, speed*dt);
    const mv=metersDelta(move, this.heading, this.pos.lat);
    this.pos.lat+=mv.dLat; this.pos.lng+=mv.dLng;
    const from=this.path[this.idx];
    const to2=this.path[Math.min(this.idx+1,this.path.length-1)];
    const pr=projSeg(this.pos, from, to2);
    this.pos.lat=pr.lat; this.pos.lng=pr.lng;
    this.marker.setLatLng(this.pos);
  }
}
