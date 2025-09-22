
import { MapView } from './map.js';
import { World } from './world.js';
import { bindUI } from './ui.js';

const map = new MapView('map');
const world = new World(map);
bindUI(world);
await world.loadDistrict();

function loop(){
  const dt = world.tick();
  world.step(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
