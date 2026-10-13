import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";

const $ = (id) => document.getElementById(id);
const state = { rows: [], modelName: "", scene: null, camera: null, renderer: null, controls: null, model: null };
const STORAGE_KEY = "aerolab-cfd-results-v1";
function saveRowsLocally() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.rows)); }
  catch (err) { console.warn("Impossible de sauvegarder les résultats localement.", err); }
}
function restoreRowsLocally() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (Array.isArray(saved)) state.rows = saved.filter(r => r && typeof r === "object");
  } catch (err) { console.warn("Les résultats sauvegardés sont illisibles.", err); }
}
restoreRowsLocally();

function showView(id) {
  document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === id));
  document.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.target === id));
  if (id === "results") setTimeout(drawCharts, 60);
}
document.querySelectorAll(".nav-item[data-target]").forEach(b => b.addEventListener("click", () => showView(b.dataset.target)));
document.querySelectorAll("[data-goto]").forEach(b => b.addEventListener("click", () => showView(b.dataset.goto)));
$("dismissNotice").addEventListener("click", () => $("dataNotice").remove());

function initViewer() {
  const host = $("viewer"), scene = new THREE.Scene();
  scene.background = new THREE.Color("#0c1420");
  const camera = new THREE.PerspectiveCamera(42, host.clientWidth / host.clientHeight, 0.01, 100000);
  camera.position.set(4, 3, 5);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(host.clientWidth, host.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);
  scene.add(new THREE.HemisphereLight(0xc8e4ff, 0x243247, 2.2));
  const light = new THREE.DirectionalLight(0xffffff, 2.3); light.position.set(4, 7, 5); scene.add(light);
  const grid = new THREE.GridHelper(10, 20, 0x35516c, 0x1a2b3d); grid.position.y = -1; scene.add(grid);
  const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true;
  state.scene = scene; state.camera = camera; state.renderer = renderer; state.controls = controls;
  const resize = () => { const w=host.clientWidth||400, h=host.clientHeight||300; camera.aspect=w/h; camera.updateProjectionMatrix(); renderer.setSize(w,h); };
  window.addEventListener("resize", resize);
  const animate = () => { requestAnimationFrame(animate); controls.update(); renderer.render(scene,camera); };
  animate();
}
function fitModel(object) {
  if (state.model) state.scene.remove(state.model);
  state.model = object;
  const box = new THREE.Box3().setFromObject(object), size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  object.position.sub(center);
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  object.scale.setScalar(4 / maxDim);
  state.scene.add(object);
  state.camera.position.set(5, 3, 5); state.controls.target.set(0,0,0); state.controls.update();
  $("viewerHelp").classList.add("hidden"); $("modelState").textContent = "Modèle chargé";
}
function loadModelFile(file) {
  if (!file) return;
  const ext = file.name.split(".").pop().toLowerCase();
  state.modelName = file.name; $("modelFilename").textContent = file.name;
  $("fileInfo").classList.remove("hidden"); $("fileInfo").textContent = `${file.name} · ${(file.size/1024/1024).toFixed(2)} Mo`;
  if (["step","stp","iges","igs"].includes(ext)) {
    $("viewerHelp").classList.remove("hidden");
    $("viewerHelp").innerHTML = "Fichier CAO reçu : " + escapeHtml(file.name) + "<br>Convertissez-le en STL avec FreeCAD pour l'aperçu 3D.";
    $("modelState").textContent = "STEP à convertir";
    $("csvMessage").textContent = "Le fichier STEP n'est pas envoyé ni calculé ici. Ouvrez-le dans FreeCAD, exportez un STL puis chargez le STL pour l'aperçu.";
    return;
  }
  const url = URL.createObjectURL(file);
  if (ext === "stl") {
    new STLLoader().load(url, geometry => {
      geometry.computeVertexNormals();
      fitModel(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x75baff, metalness: .3, roughness: .42, side: THREE.DoubleSide })));
      URL.revokeObjectURL(url);
    }, undefined, err => { alert("Impossible de lire ce STL. Vérifiez le fichier."); URL.revokeObjectURL(url); console.error(err); });
  } else if (ext === "obj") {
    new OBJLoader().load(url, object => {
      object.traverse(child => { if (child.isMesh) child.material = new THREE.MeshStandardMaterial({color:0x75baff,metalness:.2,roughness:.5,side:THREE.DoubleSide}); });
      fitModel(object); URL.revokeObjectURL(url);
    }, undefined, err => { alert("Impossible de lire ce OBJ."); URL.revokeObjectURL(url); console.error(err); });
  } else alert("Format non pris en charge pour l'aperçu. Utilisez STL ou OBJ.");
}
$("modelInput").addEventListener("change", e => loadModelFile(e.target.files[0]));
const dropZone = $("dropZone");
["dragenter","dragover"].forEach(ev => dropZone.addEventListener(ev, e => {e.preventDefault();dropZone.classList.add("dragging");}));
["dragleave","drop"].forEach(ev => dropZone.addEventListener(ev, e => {e.preventDefault();dropZone.classList.remove("dragging");}));
dropZone.addEventListener("drop", e => loadModelFile(e.dataTransfer.files[0]));

function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }
function parseCsv(text) {
  const first = text.split(/\r?\n/).find(line => line.trim()) || "";
  const delimiter = (first.match(/;/g)||[]).length > (first.match(/,/g)||[]).length ? ";" : ",";
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(x => x.trim());
  const parseLine = line => { const out=[]; let cur="", quote=false; for(let i=0;i<line.length;i++){const c=line[i];if(c==='"' && line[i+1]==='"' && quote){cur+='"';i++;}else if(c==='"'){quote=!quote;}else if(c===delimiter&&!quote){out.push(cur.trim());cur="";}else cur+=c;}out.push(cur.trim());return out; };
  if(lines.length<2) throw new Error("Le CSV doit contenir une ligne d'en-têtes et au moins une ligne de données.");
  const headers = parseLine(lines[0]).map(h => h.toLowerCase().trim().replace(/[\s-]+/g,"_"));
  const get = (row, keys) => {const i=headers.findIndex(h=>keys.includes(h));return i<0 ? "" : (row[i]??"");};
  const parsed = lines.slice(1).map(line=>{ const row=parseLine(line); const num = keys => {const raw=get(row,keys);if(raw==="")return null;const n=Number(raw.replace(",","."));return Number.isFinite(n)?n:null;};
    return {variant:get(row,["variant","version","model","modele","nom"]) || "Variante sans nom",cd:num(["cd","cx","drag_coefficient","coefficient_de_trainee"]),drag_N:num(["drag_n","drag","drag_force_n","force_trainee_n"]),lift_N:num(["lift_n","lift","lift_force_n","portance_n"]),speed_kmh:num(["speed_kmh","speed","vitesse_kmh"]) ?? Number($("speed").value),source:get(row,["source","solver","origine"]) || "Non précisée",status:get(row,["status","statut","type"]) || "Non qualifiée"};
  }).filter(r=>r.cd!==null||r.drag_N!==null||r.lift_N!==null);
  if (!parsed.length) throw new Error("Aucune ligne exploitable : vérifiez les en-têtes Cd, drag_N, lift_N ou le contenu du fichier.");
  const invalid = parsed.find(r => (r.cd !== null && r.cd < 0) || (r.drag_N !== null && r.drag_N < 0) || (r.speed_kmh !== null && r.speed_kmh < 0));
  if (invalid) throw new Error("Valeur négative détectée pour Cd, la traînée ou la vitesse. Vérifiez les unités et les données.");
  return parsed;
}
$("csvInput").addEventListener("change", async e => { const file=e.target.files[0];if(!file)return;try{state.rows=parseCsv(await file.text());renderData();$("csvMessage").textContent=`${state.rows.length} ligne(s) importée(s) depuis ${file.name}. Vérifiez source, unités et statut.`;}catch(err){$("csvMessage").textContent="Erreur CSV : "+err.message;}});
function renderData() {
  saveRowsLocally();
  const validCd=state.rows.find(r=>r.cd!==null), validDrag=state.rows.find(r=>r.drag_N!==null);
  $("metricCd").textContent=validCd?validCd.cd.toFixed(3):"—"; $("cdFoot").textContent=validCd?`${validCd.variant} · ${validCd.source} (${validCd.status})`:"Aucune donnée importée";
  $("metricDrag").textContent=validDrag?`${validDrag.drag_N.toFixed(1)} N`:"—"; $("metricVersions").textContent=String(state.rows.length);
  renderTable();renderCompare();drawCharts();
}
function renderTable() {
  const el=$("resultsTable"); if(!state.rows.length){el.innerHTML='<div class="empty-state">Aucun résultat importé. Chargez un CSV exporté par votre solveur CFD.</div>';return;}
  el.innerHTML=`<table><thead><tr><th>Variante</th><th>Cd / Cx</th><th>Traînée (N)</th><th>Portance (N)</th><th>Vitesse</th><th>Source</th><th>Statut</th></tr></thead><tbody>${state.rows.map(r=>`<tr><td>${escapeHtml(r.variant)}</td><td>${fmt(r.cd,3)}</td><td>${fmt(r.drag_N,2)}</td><td>${fmt(r.lift_N,2)}</td><td>${fmt(r.speed_kmh,1)} km/h</td><td>${escapeHtml(r.source)}</td><td>${escapeHtml(r.status)}</td></tr>`).join("")}</tbody></table>`;
}
function fmt(n,d=2){return n===null||n===undefined||!Number.isFinite(n)?"—":n.toFixed(d);}
const chartLayout = {paper_bgcolor:"rgba(0,0,0,0)",plot_bgcolor:"rgba(0,0,0,0)",font:{color:"#aebfd3",family:"Manrope, sans-serif",size:10},margin:{l:42,r:12,t:10,b:50},xaxis:{gridcolor:"#263648",tickfont:{size:9}},yaxis:{gridcolor:"#263648",zerolinecolor:"#263648"},showlegend:false};
function drawCharts(){
  if(!window.Plotly)return;
  const cd=state.rows.filter(r=>r.cd!==null),drag=state.rows.filter(r=>r.drag_N!==null);
  Plotly.react("cdChart",cd.length?[{type:"bar",x:cd.map(r=>r.variant),y:cd.map(r=>r.cd),marker:{color:"#64a9ff"},hovertemplate:"%{x}<br>Cd = %{y:.4f}<extra></extra>"}]:[],{...chartLayout,yaxis:{...chartLayout.yaxis,title:"Cd",rangemode:"tozero"}},{responsive:true,displayModeBar:false});
  Plotly.react("dragChart",drag.length?[{type:"bar",x:drag.map(r=>r.variant),y:drag.map(r=>r.drag_N),marker:{color:"#62dfb0"},hovertemplate:"%{x}<br>%{y:.2f} N<extra></extra>"}]:[],{...chartLayout,yaxis:{...chartLayout.yaxis,title:"Force (N)",rangemode:"tozero"}},{responsive:true,displayModeBar:false});
}
function renderCompare(){
  const el=$("compareTable"); if(state.rows.length<2){el.innerHTML='<div class="empty-state">Il faut au moins deux variantes importées pour comparer les résultats.</div>';$("compareNote").textContent="Importez plusieurs variantes. Les comparaisons sont descriptives et ne prouvent pas à elles seules la validité physique.";return;}
  const a=state.rows[0],rows=state.rows;
  el.innerHTML=`<table><thead><tr><th>Variante</th><th>Cd</th><th>Traînée (N)</th><th>Écart de traînée vs 1re</th><th>Source / statut</th></tr></thead><tbody>${rows.map(r=>{const diff=(a.drag_N!==null&&r.drag_N!==null&&a.drag_N!==0)?((r.drag_N-a.drag_N)/Math.abs(a.drag_N)*100):null;return `<tr><td>${escapeHtml(r.variant)}</td><td>${fmt(r.cd,4)}</td><td>${fmt(r.drag_N,2)}</td><td>${diff===null?"—":(diff>0?"+":"")+diff.toFixed(1)+"%"}</td><td>${escapeHtml(r.source)} / ${escapeHtml(r.status)}</td></tr>`}).join("")}</tbody></table>`;
  const speeds=[...new Set(rows.map(r=>r.speed_kmh).filter(x=>x!==null))];
  $("compareNote").textContent=speeds.length>1?"Attention : les vitesses ne sont pas toutes identiques. Ne comparez pas directement les forces sans normalisation.":"Vérifiez aussi le maillage, les conditions aux limites, la convergence et la surface frontale utilisée. Une différence de Cd n'est significative que si les configurations sont comparables.";
}
$("clearResults").addEventListener("click",()=>{state.rows=[];renderData();$("csvMessage").textContent="Données effacées.";});
$("calcDrag").addEventListener("click",()=>{
  const cdRow=state.rows.find(r=>r.cd!==null); if(!cdRow){$("calcResult").textContent="Aucun Cd importé. Importez un CSV de résultats CFD avant d'estimer la force.";return;}
  const v=Number($("speed").value)/3.6,rho=Number($("density").value),A=Number($("area").value);
  if(!(v>0&&rho>0&&A>0)){$("calcResult").textContent="Vérifiez les valeurs de vitesse, densité et surface.";return;}
  const F=.5*rho*v*v*cdRow.cd*A; $("calcResult").textContent=`Force estimée = ${F.toFixed(2)} N, à ${$("speed").value} km/h, avec Cd=${cdRow.cd}. Calcul théorique, non mesure expérimentale.`;
});

function getBoundaryConfig() {
  const speedKmh = Number($("bcSpeed").value);
  const axis = $("bcAxis").value;
  const sign = Number($("bcSign").value);
  const names = {inlet:$("bcInlet").value.trim(),outlet:$("bcOutlet").value.trim(),car:$("bcCar").value.trim(),ground:$("bcGround").value.trim(),sides:$("bcSides").value.trim()};
  const errors = [];
  if (!Number.isFinite(speedKmh) || speedKmh <= 0 || speedKmh > 500) errors.push("La vitesse doit être comprise entre 0 et 500 km/h, sans être nulle.");
  for (const [role,name] of Object.entries(names)) {
    if (!name) errors.push("Le nom du patch « "+role+" » est vide.");
    else if (!/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(name)) errors.push("Nom de patch invalide : « "+name+" ».");
  }
  const entries=Object.entries(names);
  for(let i=0;i<entries.length;i++) for(let j=i+1;j<entries.length;j++) if(entries[i][1] && entries[i][1]===entries[j][1]) errors.push("Le patch « "+entries[i][1]+" » est assigné plusieurs fois.");
  const velocity=[0,0,0], idx=({x:0,y:1,z:2})[axis] ?? 0;
  velocity[idx]=sign*speedKmh/3.6;
  return {speedKmh,axis,sign,velocity,names,movingGround:$("bcMovingGround").value==="yes",errors};
}
function foamVector(v){return "("+v.map(n=>(Math.abs(n)<1e-10?0:n).toFixed(6)).join(" ")+")";}
function buildOpenFoamFiles(cfg){
  const U = "FoamFile\n{\n    version     2.0;\n    format      ascii;\n    class       volVectorField;\n    object      U;\n}\n\ndimensions      [0 1 -1 0 0 0 0];\ninternalField   uniform (0 0 0);\n\nboundaryField\n{\n"+
    "    "+cfg.names.inlet+"\n    {\n        type            fixedValue;\n        value           uniform "+foamVector(cfg.velocity)+";\n    }\n"+
    "    "+cfg.names.outlet+"\n    {\n        type            pressureInletOutletVelocity;\n        value           uniform "+foamVector(cfg.velocity)+";\n    }\n"+
    "    "+cfg.names.car+"\n    {\n        type            fixedValue;\n        value           uniform (0 0 0);\n    }\n"+
    "    "+cfg.names.ground+"\n    {\n        type            fixedValue;\n        value           uniform "+foamVector(cfg.movingGround?cfg.velocity:[0,0,0])+";\n    }\n"+
    "    "+cfg.names.sides+"\n    {\n        type            slip;\n    }\n}\n";
  const p = "FoamFile\n{\n    version     2.0;\n    format      ascii;\n    class       volScalarField;\n    object      p;\n}\n\ndimensions      [0 2 -2 0 0 0 0];\ninternalField   uniform 0;\n\nboundaryField\n{\n"+
    "    "+cfg.names.inlet+"\n    {\n        type            zeroGradient;\n    }\n"+
    "    "+cfg.names.outlet+"\n    {\n        type            fixedValue;\n        value           uniform 0;\n    }\n"+
    "    "+cfg.names.car+"\n    {\n        type            zeroGradient;\n    }\n"+
    "    "+cfg.names.ground+"\n    {\n        type            zeroGradient;\n    }\n"+
    "    "+cfg.names.sides+"\n    {\n        type            zeroGradient;\n    }\n}\n";
  return {U,p};
}
function updateBoundaryPreview(){
  const cfg=getBoundaryConfig(),status=$("bcValidation"),preview=$("bcPreview");
  if(cfg.errors.length){status.textContent="À corriger : "+cfg.errors.join(" ");status.style.borderColor="#81424a";preview.innerHTML="<strong>Configuration non valide</strong><p>Corrige les champs signalés avant de générer les fichiers.</p>";$("generateBC").disabled=true;return;}
  $("generateBC").disabled=false;status.style.borderColor="#205146";
  status.textContent="Configuration valide · U entrée = "+foamVector(cfg.velocity)+" m/s · sortie p = 0 Pa relatif · "+(cfg.movingGround?"sol mobile synchronisé":"sol fixe")+".";
  preview.innerHTML="<strong>Conditions générées automatiquement</strong><p>Entrée : fixedValue "+foamVector(cfg.velocity)+" m/s · Sortie : pression relative 0 Pa · Carrosserie : paroi fixe · Sol : "+(cfg.movingGround?"vitesse "+foamVector(cfg.velocity):"fixe")+" · Haut/côtés : slip. Vérifie les patches dans constant/polyMesh/boundary.</p><div class=\"button-row\"><button class=\"button button-secondary\" id=\"downloadU\">Télécharger 0/U</button><button class=\"button button-secondary\" id=\"downloadP\">Télécharger 0/p</button></div>";
  $("downloadU").addEventListener("click",()=>downloadText("U",buildOpenFoamFiles(getBoundaryConfig()).U));
  $("downloadP").addEventListener("click",()=>downloadText("p",buildOpenFoamFiles(getBoundaryConfig()).p));
}
["bcSpeed","bcAxis","bcSign","bcMovingGround","bcInlet","bcOutlet","bcCar","bcGround","bcSides"].forEach(id=>$(id).addEventListener("input",updateBoundaryPreview));
$("generateBC").addEventListener("click",()=>{
  const cfg=getBoundaryConfig();if(cfg.errors.length){updateBoundaryPreview();return;}
  updateBoundaryPreview();const files=buildOpenFoamFiles(cfg);
  downloadText("U",files.U);setTimeout(()=>downloadText("p",files.p),250);
});
$("downloadBCSummary").addEventListener("click",()=>{
  const cfg=getBoundaryConfig();if(cfg.errors.length){updateBoundaryPreview();return;}
  const data={tool:"AeroLab CFD boundary-condition generator",solverTarget:"OpenFOAM",note:"Template only. Confirm patch names and solver compatibility against the actual mesh and selected solver.",speed_kmh:cfg.speedKmh,velocity_m_s:cfg.velocity,pressureOutlet:{value:0,reference:"gauge pressure / relative pressure"},movingGround:cfg.movingGround,patches:cfg.names,turbulenceModel:$("turbulence").value,solverType:$("solverType").value,temperature_C:Number($("temperature").value)};
  downloadText("aerolab-boundary-conditions.json",JSON.stringify(data,null,2));
});
$("bcSpeed").addEventListener("input",()=>{$("setupSpeed").value=$("bcSpeed").value;$("speed").value=$("bcSpeed").value;});
$("setupSpeed").addEventListener("input",()=>{$("bcSpeed").value=$("setupSpeed").value;$("speed").value=$("setupSpeed").value;updateBoundaryPreview();});
$("saveSetup").addEventListener("click",()=>{
  $("setupSummary").textContent=$("setupSpeed").value+" km/h · "+$("temperature").value+" °C · "+$("turbulence").value+" · "+$("solverType").value+". Fichiers U/p générés séparément ; maillage, pression de référence et champs de turbulence restent à vérifier.";
  updateBoundaryPreview();
});

$("downloadTemplate").addEventListener("click",()=>{const csv="variant,Cd,drag_N,lift_N,speed_kmh,source,status\nVersion A,0.31,125.4,-12,100,EXEMPLE_FICTIF,DEMO\nVersion B,0.28,113.3,-8,100,EXEMPLE_FICTIF,DEMO\n";downloadText("aerolab-modele-resultats.csv",csv);});
$("exportReport").addEventListener("click",()=>{
  const headers=["variant","Cd","drag_N","lift_N","speed_kmh","source","status"];
  const csv=[headers.join(","),...state.rows.map(r=>headers.map(h=>csvEscape(r[h]??"")).join(","))].join("\n");
  if(!state.rows.length){alert("Aucun résultat à exporter. Importez d'abord un CSV.");return;} downloadText("aerolab-resultats-export.csv",csv);
});
function csvEscape(v){const s=String(v);return /[",;\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}
function downloadText(name,text){const blob=new Blob(["\\uFEFF",text],{type:"text/csv;charset=utf-8;"}),a=document.createElement("a"),url=URL.createObjectURL(blob);a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}

const engineDefaults = { url: "http://127.0.0.1:8765" };
function engineUrl(){ return ($("engineUrl")?.value.trim() || "http://127.0.0.1:8765").replace(/\/+$/,""); }
function engineHeaders(){ const token=$("engineToken")?.value.trim(); return token ? {"Authorization":"Bearer "+token} : {}; }
function engineMessage(message, good=false){ const el=$("engineStatus"); if(el) el.textContent=message; const badge=$("engineBadge"); if(badge){badge.textContent=good?"Connecté":"À vérifier";badge.className="pill "+(good?"green":"amber");} }
let activeEngineJob = null;
let enginePollHandle = null;
function stopEnginePolling(){if(enginePollHandle){clearTimeout(enginePollHandle);enginePollHandle=null;}}
async function checkLocalEngine(){
  try{
    const response=await fetch(engineUrl()+"/api/health",{headers:engineHeaders(),cache:"no-store"});
    const data=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(data.detail||("HTTP "+response.status));
    const foam=data.openfoam||{};
    engineMessage(data.openfoam_available?"Moteur prêt. "+(foam.message||"OpenFOAM détecté."):"Service connecté, mais solveur indisponible : "+(foam.message||data.message||"OpenFOAM absent."),!!data.openfoam_available);
    return data;
  }catch(err){engineMessage("Connexion impossible : "+err.message+". Démarre start-windows.bat et vérifie le code d'accès.");return null;}
}
$("engineCheck")?.addEventListener("click",checkLocalEngine);
async function downloadEngineResults(jobId){
  try{
    const response=await fetch(engineUrl()+"/api/jobs/"+encodeURIComponent(jobId)+"/download",{headers:engineHeaders()});
    if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.detail||("HTTP "+response.status));}
    const blob=await response.blob(), url=URL.createObjectURL(blob), a=document.createElement("a");
    a.href=url;a.download="AeroLab-CFD-"+jobId+".zip";document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
  }catch(err){engineMessage("Téléchargement impossible : "+err.message);}
}
function openEngineLog(jobId){
  fetch(engineUrl()+"/api/jobs/"+encodeURIComponent(jobId)+"/log",{headers:engineHeaders()}).then(r=>{if(!r.ok)throw new Error("Journal indisponible");return r.blob();}).then(blob=>{const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="AeroLab-CFD-"+jobId+".log";a.click();URL.revokeObjectURL(url);}).catch(err=>engineMessage(err.message));
}
async function pollEngineJob(jobId){
  stopEnginePolling();
  try{
    const response=await fetch(engineUrl()+"/api/jobs/"+encodeURIComponent(jobId),{headers:engineHeaders(),cache:"no-store"});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.detail||("HTTP "+response.status));
    const progress=Math.max(0,Math.min(100,Number(data.progress)||0));
    const progressEl=$("engineProgress");if(progressEl){progressEl.hidden=false;progressEl.value=progress;}
    const download=$("engineDownload");if(download){download.hidden=data.status!=="completed";download.onclick=()=>downloadEngineResults(jobId);}
    const logBtn=$("engineLog");if(logBtn){logBtn.hidden=!["failed","running","meshing","preparing"].includes(data.status);logBtn.onclick=()=>openEngineLog(jobId);}
    const line=(data.log_tail||data.error_tail||"").trim().split(/\r?\n/).slice(-2).join(" · ");
    engineMessage((data.message||data.status)+" — "+progress+"%"+(line?"\n"+line:""),data.status==="completed");
    if(data.status==="completed"){activeEngineJob=null;engineMessage("Calcul terminé. Télécharge l'archive ZIP puis ouvre les fichiers VTK dans ParaView pour explorer le champ d'écoulement.",true);return;}
    if(data.status==="failed"){activeEngineJob=null;engineMessage("Calcul échoué : "+(data.message||"erreur OpenFOAM")+(line?"\n"+line:""));return;}
    enginePollHandle=setTimeout(()=>pollEngineJob(jobId),2500);
  }catch(err){engineMessage("Suivi interrompu : "+err.message+". Le calcul peut continuer sur le PC. Clique sur « Suivre un calcul » pour reprendre.");}
}
$("engineResume")?.addEventListener("click",()=>{const id=$("engineJobId")?.value.trim();if(!id){engineMessage("Aucun identifiant de calcul à suivre.");return;}activeEngineJob=id;pollEngineJob(id);});
$("engineSubmit")?.addEventListener("click",async()=>{
  const file=$("engineGeometry")?.files?.[0],speed=Number($("engineSpeed")?.value);
  if(!file){engineMessage("Choisis d'abord un fichier STL ou OBJ.");return;}
  if(!Number.isFinite(speed)||speed<=0||speed>300){engineMessage("La vitesse doit être comprise entre 0 et 300 km/h.");return;}
  if(!/\.(stl|obj)$/i.test(file.name)){engineMessage("Format non pris en charge : utilise STL ou OBJ.");return;}
  const health=await checkLocalEngine();
  if(!health||!health.openfoam_available){engineMessage("Le moteur n'est pas prêt. Installe et configure OpenFOAM/WSL avant de lancer le calcul.");return;}
  const form=new FormData();form.append("geometry",file);form.append("speed_kmh",String(speed));
  const button=$("engineSubmit");if(button)button.disabled=true;
  engineMessage("Envoi du modèle et démarrage du maillage automatique…");
  try{
    const response=await fetch(engineUrl()+"/api/jobs",{method:"POST",headers:engineHeaders(),body:form});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.detail||("HTTP "+response.status));
    activeEngineJob=data.id;if($("engineJobId"))$("engineJobId").value=data.id;
    engineMessage("Calcul lancé. AeroLab prépare le maillage puis résout l'écoulement d'air.",true);
    pollEngineJob(data.id);
  }catch(err){engineMessage("Lancement impossible : "+err.message);}
  finally{if(button)button.disabled=false;}
});
const TUTORIAL_SEEN_KEY = "aerolab-cfd-tutorial-seen-v1";
function showTutorial(){const overlay=$("tutorialOverlay");if(overlay){overlay.hidden=false;document.body.classList.add("tutorial-open");$("tutorialClose")?.focus();}}
function hideTutorial(){const overlay=$("tutorialOverlay");if(overlay)overlay.hidden=true;document.body.classList.remove("tutorial-open");if($("tutorialDontShow")?.checked){try{localStorage.setItem(TUTORIAL_SEEN_KEY,"1");}catch{}}}
$("openTutorial")?.addEventListener("click",showTutorial);
$("tutorialClose")?.addEventListener("click",hideTutorial);
$("tutorialLater")?.addEventListener("click",hideTutorial);
$("tutorialStart")?.addEventListener("click",hideTutorial);
$("tutorialOverlay")?.addEventListener("click",event=>{if(event.target===$("tutorialOverlay"))hideTutorial();});
document.addEventListener("keydown",event=>{if(event.key==="Escape"&&$("tutorialOverlay")&&!$("tutorialOverlay").hidden)hideTutorial();});
try{if(localStorage.getItem(TUTORIAL_SEEN_KEY)!=="1")showTutorial();}catch{showTutorial();}

initViewer();renderData();updateBoundaryPreview();
