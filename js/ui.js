
export function bindUI(world){
  const weather=document.getElementById('weather');
  const time=document.getElementById('timeOfDay');
  const timeVal=document.getElementById('timeVal');
  const speed=document.getElementById('simSpeed');
  const people=document.getElementById('peopleCount');
  const cars=document.getElementById('carsCount');
  const addBB=document.getElementById('addBillboard');
  const clearBB=document.getElementById('clearBillboards');
  const bbR=document.getElementById('bbRadius');
  const bbF=document.getElementById('bbFov');
  const stats=document.getElementById('stats');
  const toggle=document.getElementById('toggle');
  const reset=document.getElementById('reset');

  const updateStats=()=>{
    const avg = world.billboards.length ? Math.round(world.billboards.reduce((s,b)=>s+((b._secHistory||[]).reduce((a,x)=>a+x,0)/Math.max(1,(b._secHistory||[]).length)),0)/world.billboards.length) : 0;
    const total = world.billboards.length ? world.billboards.reduce((s,b)=>s+(b.seenTotal||0),0) : 0;
    stats.innerHTML = `Средний охват/сек (уникальные): <b>${avg}</b><br>Всего уникальных зрителей: <b>${total}</b>`;
  };
  setInterval(updateStats, 1000);

  weather.onchange=()=>{ world.params.weather=weather.value; };
  speed.oninput=()=>{ world.params.simSpeed=parseFloat(speed.value); };
  time.oninput=()=>{ world.params.timeOfDay=parseFloat(time.value); timeVal.textContent=(Math.floor(time.value)).toString().padStart(2,'0')+':'+Math.round((time.value%1)*60).toString().padStart(2,'0'); };
  people.onchange=()=>{ world.params.peopleCount=parseInt(people.value||'0'); world.spawn(); };
  cars.onchange=()=>{ world.params.carsCount=parseInt(cars.value||'0'); world.spawn(); };

  let placing=false;
  addBB.onclick=()=>{ placing=!placing; addBB.classList.toggle('active',placing); };
  world.mapView.map.on('click',(e)=>{
    if(!placing) return;
    placing=false; addBB.classList.remove('active');
    world.addBillboard(e.latlng, parseFloat(bbR.value), parseFloat(bbF.value));
  });
  clearBB.onclick=()=> world.clearBillboards();

  toggle.onclick=()=>{ world.setRunning(!world.running); toggle.textContent = world.running?'Пауза':'Запустить'; };
  reset.onclick=()=>{ world.spawn(); };
}
