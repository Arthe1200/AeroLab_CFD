from __future__ import annotations

import json
import os
import secrets
import shutil
import subprocess
import time
import uuid
from pathlib import Path

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

ROOT = Path(__file__).resolve().parent
JOBS = ROOT / "jobs"
TOKEN_FILE = ROOT / ".access-token"
JOBS.mkdir(exist_ok=True)

token = os.environ.get("AEROLAB_TOKEN", "").strip()
if not token:
    if TOKEN_FILE.exists():
        token = TOKEN_FILE.read_text(encoding="utf-8").strip()
    else:
        token = secrets.token_urlsafe(24)
        TOKEN_FILE.write_text(token, encoding="utf-8")
        try:
            TOKEN_FILE.chmod(0o600)
        except OSError:
            pass

app = FastAPI(title="AeroLab CFD Local Bridge", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://arthe1200.github.io",
        "http://127.0.0.1:8000",
        "http://localhost:8000",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


def require_token(authorization: str | None) -> None:
    expected = f"Bearer {token}"
    if not authorization or not secrets.compare_digest(authorization, expected):
        raise HTTPException(status_code=401, detail="Code d'accès local absent ou incorrect.")


def detect_openfoam() -> dict:
    wsl = shutil.which("wsl.exe") or shutil.which("wsl")
    if not wsl:
        return {
            "available": False,
            "method": "WSL",
            "message": "WSL n'est pas détecté. Installe WSL et OpenFOAM dans une distribution Linux.",
        }
    try:
        result = subprocess.run(
            [wsl, "bash", "-lc", "command -v simpleFoam || command -v foamRun"],
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
        executable = result.stdout.strip().splitlines()[0] if result.returncode == 0 and result.stdout.strip() else ""
        if executable:
            return {"available": True, "method": "WSL", "executable": executable, "message": "Solveur détecté dans WSL."}
        return {
            "available": False,
            "method": "WSL",
            "message": "WSL répond, mais simpleFoam/foamRun n'est pas trouvé. Charge l'environnement OpenFOAM dans le shell WSL.",
        }
    except (subprocess.TimeoutExpired, OSError) as exc:
        return {"available": False, "method": "WSL", "message": f"Vérification WSL impossible : {exc}"}


@app.get("/api/health")
def health(authorization: str | None = Header(default=None)):
    require_token(authorization)
    foam = detect_openfoam()
    return {
        "ok": True,
        "service": "AeroLab CFD Local Bridge",
        "version": app.version,
        "openfoam_available": foam["available"],
        "openfoam": foam,
        "message": "Le pont local est actif. La réception d'une géométrie ne lance pas encore une simulation CFD.",
    }


@app.post("/api/jobs")
async def receive_geometry(
    geometry: UploadFile = File(...),
    speed_kmh: float = Form(...),
    authorization: str | None = Header(default=None),
):
    require_token(authorization)
    if not 0 < speed_kmh <= 300:
        raise HTTPException(status_code=422, detail="La vitesse doit être comprise entre 0 et 300 km/h.")

    filename = Path(geometry.filename or "geometry.stl").name
    suffix = Path(filename).suffix.lower()
    if suffix not in {".stl", ".obj"}:
        raise HTTPException(status_code=415, detail="Formats acceptés : STL et OBJ. Convertis STEP/IGES en STL avec FreeCAD.")
    job_id = uuid.uuid4().hex[:12]
    job_dir = JOBS / job_id
    job_dir.mkdir(parents=True, exist_ok=False)
    target = job_dir / f"geometry{suffix}"
    max_bytes = 250 * 1024 * 1024
    size = 0
    try:
        with target.open("wb") as out:
            while True:
                chunk = await geometry.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > max_bytes:
                    raise HTTPException(status_code=413, detail="Fichier trop volumineux (maximum 250 Mo).")
                out.write(chunk)
    except Exception:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise
    finally:
        await geometry.close()

    record = {
        "id": job_id,
        "status": "received_not_simulated",
        "created_unix": time.time(),
        "original_filename": filename,
        "saved_geometry": str(target.relative_to(ROOT)),
        "size_bytes": size,
        "speed_kmh": speed_kmh,
        "solver": detect_openfoam(),
        "notice": "Géométrie reçue localement. Aucun maillage ni calcul CFD n'a été exécuté.",
    }
    (job_dir / "job.json").write_text(json.dumps(record, indent=2, ensure_ascii=False), encoding="utf-8")
    return JSONResponse(record, status_code=202)


if __name__ == "__main__":
    import uvicorn
    print("AeroLab CFD Local Bridge — démarrage sur http://127.0.0.1:8765")
    print(f"Code d'accès local : {token}")
    print("Garde cette fenêtre ouverte pendant l'utilisation. Ctrl+C pour arrêter.")
    uvicorn.run(app, host="127.0.0.1", port=8765, log_level="info")
