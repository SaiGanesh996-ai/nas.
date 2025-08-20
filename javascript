/* ===========================
   Utilities
=========================== */
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = t => t<0.5 ? 2*t*t : 1 - Math.pow(-2*t+2,2)/2;

/* ===========================
   Parallax (scroll + blobs)
=========================== */
const floats = Array.from(document.querySelectorAll('.float'));
const onScroll = () => {
  const y = window.scrollY;
  floats.forEach(el => {
    const s = parseFloat(el.dataset.speed || 0.1);
    el.style.transform = `translate3d(0, ${y * s}px, 0)`;
  });
};
document.addEventListener('scroll', onScroll, { passive: true });

/* Reveal on view */
const io = new IntersectionObserver((entries)=>{
  for(const e of entries){
    if(e.isIntersecting){ e.target.classList.add('is-visible'); io.unobserve(e.target); }
  }
},{ threshold:0.2 });
document.querySelectorAll('.reveal').forEach(el=>io.observe(el));

/* Counter animation */
function animateCount(el){
  const target = parseInt(el.dataset.count,10) || 0;
  const numEl = el.querySelector('.num');
  const start = performance.now();
  const dur = 1400 + Math.random()*600;
  function tick(now){
    const t = clamp((now-start)/dur, 0, 1);
    const v = Math.round(lerp(0, target, easeInOut(t)));
    numEl.textContent = v.toLocaleString();
    if(t<1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
document.querySelectorAll('.stat').forEach(el=>{
  const obs = new IntersectionObserver((ents)=>{
    ents.forEach(ent=>{
      if(ent.isIntersecting){ animateCount(el); obs.disconnect(); }
    });
  },{threshold:0.5});
  obs.observe(el);
});

/* Footer year */
document.getElementById('year').textContent = new Date().getFullYear();

/* ===========================
   THREE.js Globe
=========================== */
const canvas = document.getElementById('globeCanvas');
const labelEl = document.getElementById('markerLabel');
const pulseEl = document.getElementById('markerPulse');

const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
const CAMERA_DIST = 3.2;
camera.position.set(0,0,CAMERA_DIST);

function resize(){
  const rect = canvas.getBoundingClientRect();
  const w = rect.width, h = Math.max(400, rect.height);
  renderer.setSize(w, h, false);
  camera.aspect = w/h; camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas);

/* Globe group */
const group = new THREE.Group(); scene.add(group);
const R = 1;

const sphere = new THREE.Mesh(
  new THREE.SphereGeometry(R, 96, 96), // higher segments for clarity
  new THREE.MeshStandardMaterial({
    map: new THREE.TextureLoader().load('https://threejs.org/examples/textures/land_ocean_ice_cloud_2048.jpg'),
    roughness: 0.9,
    metalness: 0.0
  })
);
group.add(sphere);

/* Subtle atmosphere */
const glow = new THREE.Mesh(
  new THREE.SphereGeometry(R*1.06, 96, 96),
  new THREE.MeshBasicMaterial({ color:0x6ee7ff, transparent:true, opacity:0.07, side:THREE.BackSide })
);
group.add(glow);

/* Lighting */
const light1 = new THREE.DirectionalLight(0xffffff, 1.15); light1.position.set(2,1,2); scene.add(light1);
const light2 = new THREE.AmbientLight(0x406080, 0.45); scene.add(light2);

/* Lat/Lon helpers */
function latLonToVec3(lat, lon, r=R){
  const phi = (90 - lat) * (Math.PI/180);
  const theta = (lon + 180) * (Math.PI/180);
  const x = -r * Math.sin(phi) * Math.cos(theta);
  const z =  r * Math.sin(phi) * Math.sin(theta);
  const y =  r * Math.cos(phi);
  return new THREE.Vector3(x,y,z);
}

/* Pin (3D) */
const marker = new THREE.Mesh(
  new THREE.SphereGeometry(0.02, 16, 16),
  new THREE.MeshBasicMaterial({ color:0x6ee7ff })
);
group.add(marker);

/* Position UI (label + pulse) to projected marker */
function updateMarkerUI(){
  const v = marker.position.clone().project(camera);
  const rect = canvas.getBoundingClientRect();
  const x = (v.x * 0.5 + 0.5) * rect.width + rect.left;
  const y = (-v.y * 0.5 + 0.5) * rect.height + rect.top;

  labelEl.style.left = `${x}px`;
  labelEl.style.top  = `${y}px`;
  pulseEl.style.left = `${x}px`;
  pulseEl.style.top  = `${y}px`;

  const visible = v.z < 1 && v.z > -1;
  labelEl.style.display = visible ? 'block' : 'none';
  pulseEl.style.display = visible ? 'block' : 'none';
}
window.addEventListener('scroll', updateMarkerUI, {passive:true});
window.addEventListener('resize', updateMarkerUI);

/* Camera tween to look at a location
   We move the camera to the ray through the marker (front-on view) */
let moving = false;
function focusLatLon(lat, lon, dur=1800){
  const target = latLonToVec3(lat, lon, 1); // direction to location
  const startPos = camera.position.clone();
  const endPos = target.clone().normalize().multiplyScalar(CAMERA_DIST);

  const start = performance.now();
  moving = true;

  function step(now){
    const t = clamp((now-start)/dur, 0, 1);
    const k = easeInOut(t);
    camera.position.lerpVectors(startPos, endPos, k);
    camera.lookAt(0,0,0);
    renderer.render(scene, camera);
    updateMarkerUI();
    if(t<1 && moving){ requestAnimationFrame(step); }
    else { moving = false; }
  }
  requestAnimationFrame(step);
}

/* Move pin to the location */
function movePin(lat, lon){
  marker.position.copy(latLonToVec3(lat, lon, R+0.02));
}

/* Idle auto-rotation (when not moving) */
let autoRot = 0.003;
let t = 0;
function animate(){
  requestAnimationFrame(animate);
  if(!moving){
    group.rotation.y += autoRot;              // slow auto spin
    group.position.y = Math.sin(t)*0.012;     // gentle bob
  }
  t += 0.005;
  renderer.render(scene, camera);
  updateMarkerUI();
}
resize();
animate();

/* ===========================
   Tour Logic (one full cycle)
=========================== */
const stops = [
  {
    name: "Hyderabad • India",
    city: "Hyderabad, India",
    lat: 17.3850, lon: 78.4867,
    desc: "Open Source Circle mentoring students into global OSS.",
    meta: "Asia • Engineering • Mentorship"
  },
  {
    name: "Nairobi • Kenya",
    city: "Nairobi, Kenya",
    lat: -1.286389, lon: 36.817223,
    desc: "Climate Data Guild: mapping heat islands & micro-forests.",
    meta: "Africa • Climate • Data"
  },
  {
    name: "Berlin • Germany",
    city: "Berlin, Germany",
    lat: 52.52, lon: 13.4050,
    desc: "Creators Collective: storytelling, editing, monetization.",
    meta: "Europe • Media • Workshops"
  },
  {
    name: "São Paulo • Brazil",
    city: "São Paulo, Brazil",
    lat: -23.5505, lon: -46.6333,
    desc: "Urban Labs: civic tech meetups & open city dashboards.",
    meta: "South America • Civic Tech"
  },
  {
    name: "San Francisco • USA",
    city: "San Francisco, USA",
    lat: 37.7749, lon: -122.4194,
    desc: "Startup Studio: community sprints & founder AMAs.",
    meta: "North America • Startups"
  }
];

const storyTitle = document.getElementById('storyTitle');
const storyDesc  = document.getElementById('storyDesc');
const storyMeta  = document.getElementById('storyMeta');

let tourIndex = 0;
let tourRunning = false;
let tourFinished = false;
let tourCancel = null;

function showStop(i){
  const s = stops[i];
  labelEl.innerHTML = `<strong>${s.name.split('•')[0].trim()}</strong> • ${s.name.split('•')[1].trim()}`;
  storyTitle.textContent = s.city;
  storyDesc.textContent  = s.desc;
  storyMeta.textContent  = s.meta;
  movePin(s.lat, s.lon);
}

function playStop(i){
  return new Promise(resolve=>{
    showStop(i);
    focusLatLon(stops[i].lat, stops[i].lon, 1800);
    // pause after reach
    const timeout = setTimeout(()=>resolve(), 2600); // ~0.8s hold
    // cancellation handler
    tourCancel = () => { clearTimeout(timeout); resolve(); };
  });
}

async function runTourOnce(){
  tourRunning = true;
  tourFinished = false;
  autoRot = 0.000; // stop idle spin during tour
  for(let i=0; i<stops.length; i++){
    tourIndex = i;
    await playStop(i);
    if(!tourRunning) break;
  }
  // Final: pull back to a neutral view and stop
  if(tourRunning){
    focusLatLon(10, 20, 1200);
    setTimeout(()=>{ autoRot = 0.0; tourFinished = true; tourRunning = false; }, 1300);
  }else{
    tourFinished = false;
  }
}

/* Controls */
const playBtn   = document.getElementById('playTourBtn');
const pauseBtn  = document.getElementById('pauseTourBtn');
const replayBtn = document.getElementById('replayTourBtn');

playBtn.addEventListener('click', ()=>{
  if(!tourRunning){
    tourRunning = true;
    runTourOnce();
  }
});
pauseBtn.addEventListener('click', ()=>{
  if(tourRunning){
    tourRunning = false;
    autoRot = 0.0025; // resume light spin
    if(typeof tourCancel === 'function') tourCancel();
  }
});
replayBtn.addEventListener('click', ()=>{
  tourRunning = false;
  autoRot = 0.0;
  if(typeof tourCancel === 'function') tourCancel();
  setTimeout(()=> runTourOnce(), 100);
});

/* Start automatically when user reaches globe section */
const globeSection = document.getElementById('globe');
const autoObs = new IntersectionObserver((entries)=>{
  for(const e of entries){
    if(e.isIntersecting && !tourFinished && !tourRunning){
      runTourOnce();
      autoObs.disconnect();
    }
  }
},{threshold:0.35});
autoObs.observe(globeSection);

/* Smooth mouse tilt (subtle) */
canvas.addEventListener('pointermove', (e)=>{
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left)/rect.width * 2 - 1;
  const y = -((e.clientY - rect.top)/rect.height * 2 - 1);
  group.rotation.x = clamp(y*0.2, -0.35, 0.35);
  group.rotation.z = clamp(x*0.2, -0.35, 0.35);
});
