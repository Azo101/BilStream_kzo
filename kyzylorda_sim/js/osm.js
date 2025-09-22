
// Very small loader: try Overpass; if fails -> offline JSON snapshot in data/graph_magnum.json
export async function loadOSM(bbox){
  const [s,w,n,e] = bbox; // south, west, north, east
  const query = `[out:json][timeout:25];
    (
      way["highway"]["highway"~"primary|secondary|tertiary|residential|service|unclassified|living_street"](${s},${w},${n},${e});
      way["highway"]["highway"~"footway|path|pedestrian|steps|track"](${s},${w},${n},${e});
      node["highway"="traffic_signals"](${s},${w},${n},${e});
      way["building"](${s},${w},${n},${e});
    );
    (._;>;);
    out;`;
  const endpoint = "https://overpass.kumi.systems/api/interpreter";
  try{
    const res = await fetch(endpoint, {method:"POST", body:query});
    if(!res.ok) throw new Error(res.statusText);
    const data = await res.json();
    return convert(data);
  }catch(err){
    console.warn("Overpass failed, fallback to offline snapshot:", err);
    return await (await fetch('data/graph_magnum.json')).json();
  }
}

function convert(osm){
  const nodes = new Map();
  for (const el of osm.elements){
    if (el.type==='node'){ nodes.set(el.id,{lat:el.lat,lng:el.lon}); }
  }
  const ways = [];
  const buildings = [];
  const signals = [];
  for (const el of osm.elements){
    if(el.type==='node' && el.tags && el.tags.highway==='traffic_signals'){ signals.push(el.id); }
    if(el.type==='way' && el.tags){
      if(el.tags.building){ // polygon
        const poly = el.nodes.map(id=>nodes.get(id)).filter(Boolean);
        if(poly.length>2) buildings.push(poly);
      }else if(el.tags.highway){
        const hw = el.tags.highway;
        const car = /primary|secondary|tertiary|residential|service|unclassified|living_street/.test(hw);
        const foot = /footway|path|pedestrian|steps|track|residential|service|living_street/.test(hw);
        const oneway = el.tags.oneway === 'yes';
        const nds = el.nodes.map(id=>nodes.get(id)).filter(Boolean);
        if(nds.length>1) ways.push({type:'road', car, foot, oneway, nodes:nds});
      }
    }
  }
  return { nodes, ways, buildings, signals };
}
