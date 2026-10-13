import json, os, secrets, shutil, subprocess, sys, time, uuid
from pathlib import Path
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
ROOT=Path(__file__).resolve().parent; JOBS=ROOT/"jobs"; TOKEN_FILE=ROOT/".access-token"; JOBS.mkdir(exist_ok=True)
token=os.environ.get("AEROLAB_TOKEN","").strip()
if not token:
 if TOKEN_FILE.exists(): token=TOKEN_FILE.read_text(encoding="utf-8").strip()
 else:
  token=secrets.token_urlsafe(24); TOKEN_FILE.write_text(token,encoding="utf-8")
  try: TOKEN_FILE.chmod(0o600)
  except OSError: pass
app=FastAPI(title="AeroLab CFD Local Engine",version="0.2.0")
app.add_middleware(CORSMiddleware,allow_origins=["https://arthe1200.github.io","http://127.0.0.1:8000","http://localhost:8000"],allow_credentials=False,allow_methods=["GET","POST","OPTIONS"],allow_headers=["Authorization","Content-Type"])
def auth(value):
 if not value or not secrets.compare_digest(value,"Bearer "+token): raise HTTPException(401,"Code d'accès local absent ou incorrect.")
def safe_job(job_id):
 if len(job_id)!=12 or not job_id.isalnum(): raise HTTPException(404,"Simulation introuvable.")
 d=(JOBS/job_id).resolve()
 if d.parent!=JOBS.resolve() or not d.is_dir(): raise HTTPException(404,"Simulation introuvable.")
 return d
def record(d):
 try: return json.loads((d/"job.json").read_text(encoding="utf-8"))
 except Exception: raise HTTPException(500,"État de simulation illisible.")
def detect_openfoam():
 wsl=shutil.which("wsl.exe") or shutil.which("wsl")
 if not wsl: return {"available":False,"message":"WSL n'est pas détecté. Installe WSL et OpenFOAM."}
 script=r'for f in /opt/openfoam*/etc/bashrc /usr/lib/openfoam/openfoam*/etc/bashrc /usr/share/openfoam/etc/bashrc; do if [ -f "$f" ]; then . "$f"; break; fi; done; command -v blockMesh && command -v snappyHexMesh && command -v simpleFoam'
 try:
  r=subprocess.run([wsl,"bash","-lc",script],capture_output=True,text=True,timeout=8,check=False)
  ok=r.returncode==0 and all(x in r.stdout for x in ("blockMesh","snappyHexMesh","simpleFoam"))
  return {"available":ok,"message":"OpenFOAM et les outils de maillage sont détectés." if ok else "WSL répond, mais blockMesh, snappyHexMesh et simpleFoam ne sont pas tous accessibles après chargement de l'environnement OpenFOAM."}
 except Exception as e: return {"available":False,"message":"Vérification OpenFOAM impossible : "+str(e)}
@app.get("/api/health")
def health(authorization:str|None=Header(default=None)):
 auth(authorization); foam=detect_openfoam()
 return {"ok":True,"service":"AeroLab CFD Local Engine","version":app.version,"openfoam_available":foam["available"],"openfoam":foam,"message":foam["message"]}
@app.post("/api/jobs")
async def create_job(geometry:UploadFile=File(...),speed_kmh:float=Form(100),authorization:str|None=Header(default=None)):
 auth(authorization)
 if not 0<speed_kmh<=300: raise HTTPException(422,"La vitesse doit être comprise entre 0 et 300 km/h.")
 name=Path(geometry.filename or "geometry.stl").name; suffix=Path(name).suffix.lower()
 if suffix not in {".stl",".obj"}: raise HTTPException(415,"Formats acceptés : STL et OBJ. Convertis STEP/IGES en STL.")
 foam=detect_openfoam()
 if not foam["available"]: raise HTTPException(503,foam["message"]+" Le calcul n'a pas été lancé.")
 jid=uuid.uuid4().hex[:12]; d=JOBS/jid; d.mkdir()
 target=d/("geometry"+suffix); size=0
 try:
  with target.open("wb") as out:
   while True:
    chunk=await geometry.read(1024*1024)
    if not chunk: break
    size+=len(chunk)
    if size>250*1024*1024: raise HTTPException(413,"Fichier trop volumineux (maximum 250 Mo).")
    out.write(chunk)
 finally: await geometry.close()
 rec={"id":jid,"status":"queued","progress":1,"message":"Modèle reçu ; démarrage du cas CFD.","created_unix":time.time(),"original_filename":name,"saved_geometry":target.name,"size_bytes":size,"speed_kmh":speed_kmh,"solver":foam}
 (d/"job.json").write_text(json.dumps(rec,indent=2,ensure_ascii=False),encoding="utf-8")
 subprocess.Popen([sys.executable,str(ROOT/"solver.py"),jid,str(speed_kmh)],cwd=str(ROOT),stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,creationflags=getattr(subprocess,"CREATE_NO_WINDOW",0))
 return JSONResponse({"id":jid,"status":"queued","message":"Maillage et calcul lancés sur ce PC."},status_code=202)
@app.get("/api/jobs/{job_id}")
def job_status(job_id:str,authorization:str|None=Header(default=None)):
 auth(authorization); d=safe_job(job_id); r=record(d); log=d/"solver.log"
 if log.exists() and r.get("status") in {"running","meshing","preparing"}:
  try:
   tail=log.read_text(encoding="utf-8",errors="replace")[-3500:]; r["log_tail"]=tail
   if "snappyHexMesh" in tail: r["progress"]=max(r.get("progress",0),25)
   if "Time =" in tail: r["progress"]=max(r.get("progress",0),45)
  except OSError: pass
 return r
@app.get("/api/jobs/{job_id}/download")
def download(job_id:str,authorization:str|None=Header(default=None)):
 auth(authorization); d=safe_job(job_id); r=record(d); p=d/"results.zip"
 if r.get("status")!="completed" or not p.exists(): raise HTTPException(409,"Les résultats ne sont pas prêts.")
 return FileResponse(p,filename="AeroLab-CFD-"+job_id+".zip",media_type="application/zip")
@app.get("/api/jobs/{job_id}/log")
def log_download(job_id:str,authorization:str|None=Header(default=None)):
 auth(authorization); p=safe_job(job_id)/"solver.log"
 if not p.exists(): raise HTTPException(404,"Journal indisponible.")
 return FileResponse(p,filename="AeroLab-CFD-"+job_id+".log",media_type="text/plain")
if __name__=="__main__":
 import uvicorn
 print("AeroLab CFD Local Engine — http://127.0.0.1:8765"); print("Code d'accès local : "+token); print("Garde cette fenêtre ouverte.")
 uvicorn.run(app,host="127.0.0.1",port=8765,log_level="info")
