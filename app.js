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
document.querySelectorAll(".nav-item").forEach(b => b.addEventListener("click", () => showView(b.dataset.target)));
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
}
$("csvInput").addEventListener("change", async e => { const file=e.target.files[0];if(!file)return;try{state.rows=parseCsv(await file.text());renderData();$("csvMessage").textContent=`${state.rows.length} ligne(s) importée(s) depuis ${file.name}. Vérifiez source, unités et statut.`;}catch(err){$("csvMessage").textContent="Erreur CSV : "+err.message;}});
function renderData() {
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
$("saveSetup").addEventListener("click",()=>{$("setupSummary").textContent=`${$("setupSpeed").value} km/h · ${$("temperature").value} °C · ${$("turbulence").value} · ${$("solverType").value}. Paramètres de référence seulement : aucun solveur n'a été lancé.`;});
$("downloadTemplate").addEventListener("click",()=>{const csv="variant,Cd,drag_N,lift_N,speed_kmh,source,status\nVersion A,0.31,125.4,-12,100,EXEMPLE_FICTIF,DEMO\nVersion B,0.28,113.3,-8,100,EXEMPLE_FICTIF,DEMO\n";downloadText("aerolab-modele-resultats.csv",csv);});
$("exportReport").addEventListener("click",()=>{
  const headers=["variant","Cd","drag_N","lift_N","speed_kmh","source","status"];
  const csv=[headers.join(","),...state.rows.map(r=>headers.map(h=>csvEscape(r[h]??"")).join(","))].join("\n");
  if(!state.rows.length){alert("Aucun résultat à exporter. Importez d'abord un CSV.");return;} downloadText("aerolab-resultats-export.csv",csv);
});
function csvEscape(v){const s=String(v);return /[",;\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}
function downloadText(name,text){const blob=new Blob(["\\uFEFF",text],{type:"text/csv;charset=utf-8;"}),a=document.createElement("a"),url=URL.createObjectURL(blob);a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
initViewer();renderData();
