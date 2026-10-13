import json, os, shutil, subprocess, sys, time, traceback, zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parent
JOBS=ROOT/"jobs"
def update(d, **kw):
 p=d/"job.json"; x=json.loads(p.read_text(encoding="utf-8")); x.update(kw,updated_unix=time.time()); t=d/"job.tmp"; t.write_text(json.dumps(x,indent=2,ensure_ascii=False),encoding="utf-8"); t.replace(p)
def write(p,s):
 p.parent.mkdir(parents=True,exist_ok=True); p.write_text(s.strip()+"\n",encoding="utf-8")
def run(job_id,speed):
 d=(JOBS/job_id).resolve()
 if d.parent!=JOBS.resolve() or not d.exists(): raise RuntimeError("Simulation introuvable.")
 rec=json.loads((d/"job.json").read_text(encoding="utf-8")); source=(d/rec["saved_geometry"]).resolve()
 if source.parent!=d or not source.exists(): raise RuntimeError("Géométrie invalide.")
 update(d,status="preparing",progress=5,message="Préparation automatique du cas CFD.")
 try: import trimesh
 except ImportError: raise RuntimeError("trimesh absent : relance start-windows.bat.")
 mesh=trimesh.load(str(source),force="mesh",process=True)
 if mesh.is_empty or len(mesh.vertices)<4: raise RuntimeError("Le modèle 3D est vide ou illisible.")
 ext=mesh.bounds[1]-mesh.bounds[0]
 if min(ext)<=1e-7: raise RuntimeError("Le modèle possède une dimension nulle.")
 axes=sorted(range(3),key=lambda i:ext[i],reverse=True)
 if axes != [0,1,2]:
  m=trimesh.transformations.identity_matrix(); m[:3,:3]=m[:3,:3][:,axes]; mesh.apply_transform(m)
 mesh.apply_scale(4.5/float(max(mesh.extents))); b=mesh.bounds
 mesh.apply_translation([-(b[0][0]+b[1][0])/2,-(b[0][1]+b[1][1])/2,.25-b[0][2]])
 b=mesh.bounds; L=max(float(b[1][0]-b[0][0]),4.5); W=max(float(b[1][1]-b[0][1]),1.0); H=max(float(b[1][2]-b[0][2]),.5)
 x0,x1=-5*L,12*L; y0,y1=-4*L,4*L; z0,z1=0,max(5*H,3*L); u=float(speed)/3.6
 case=d/"case"; (case/"constant"/"triSurface").mkdir(parents=True,exist_ok=True); mesh.export(str(case/"constant"/"triSurface"/"car.stl"),file_type="stl")
 pts=" ".join("("+str(round(x,6))+" "+str(round(y,6))+" "+str(round(z,6))+")" for x,y,z in [(x0,y0,z0),(x1,y0,z0),(x1,y1,z0),(x0,y1,z0),(x0,y0,z1),(x1,y0,z1),(x1,y1,z1),(x0,y1,z1)])
 write(case/"system"/"blockMeshDict",f"""FoamFile {{ version 2.0; format ascii; class dictionary; object blockMeshDict; }}
convertToMeters 1; vertices ({pts});
blocks (hex (0 1 2 3 4 5 6 7) (56 28 24) simpleGrading (1 1 1)); edges ();
boundary
(
inlet {{ type patch; faces ((0 3 7 4)); }}
outlet {{ type patch; faces ((1 5 6 2)); }}
ground {{ type wall; faces ((0 1 2 3)); }}
top {{ type patch; faces ((4 7 6 5)); }}
sides {{ type symmetryPlane; faces ((0 4 5 1) (3 2 6 7)); }}
); mergePatchPairs ();""")
 write(case/"system"/"snappyHexMeshDict",f"""FoamFile {{ version 2.0; format ascii; class dictionary; object snappyHexMeshDict; }}
castellatedMesh true; snap true; addLayers false;
geometry {{ car.stl {{ type triSurfaceMesh; name car; }} }}
castellatedMeshControls {{ maxLocalCells 120000; maxGlobalCells 700000; minRefinementCells 0; maxLoadUnbalance .1; nCellsBetweenLevels 2; features (); refinementSurfaces {{ car {{ level (1 2); patchInfo {{ type wall; }} }} }} resolveFeatureAngle 30; refinementRegions {{}} locationInMesh ({x0*.5:.6g} 0 {z1*.55:.6g}); allowFreeStandingZoneFaces true; }}
snapControls {{ nSmoothPatch 3; tolerance 2; nSolveIter 30; nRelaxIter 5; implicitFeatureSnap true; explicitFeatureSnap false; }}
addLayersControls {{ relativeSizes true; layers {{}}; expansionRatio 1; finalLayerThickness .3; minThickness .1; nGrow 0; featureAngle 60; nRelaxIter 3; nSmoothSurfaceNormals 1; nSmoothNormals 3; nSmoothThickness 10; maxFaceThicknessRatio .5; maxThicknessToMedialRatio .3; minMedianAxisAngle 90; nBufferCellsNoExtrude 0; nLayerIter 20; }}
meshQualityControls {{ maxNonOrtho 70; maxBoundarySkewness 20; maxInternalSkewness 4; maxConcave 80; minVol 1e-13; minTetQuality 1e-9; minArea -1; minTwist .02; minDeterminant .001; minFaceWeight .02; minVolRatio .01; minTriangleTwist -1; nSmoothScale 4; errorReduction .75; }} mergeTolerance 1e-6;""")
 write(case/"system"/"controlDict",f"""FoamFile {{ version 2.0; format ascii; class dictionary; object controlDict; }}
application simpleFoam; startFrom startTime; startTime 0; stopAt endTime; endTime 400; deltaT 1;
writeControl timeStep; writeInterval 100; purgeWrite 2; writeFormat ascii; writePrecision 6; writeCompression off; timeFormat general; timePrecision 6; runTimeModifiable true;
functions {{ forceCoeffs1 {{ type forceCoeffs; libs ("libforces.so"); patches (car); rho rhoInf; rhoInf 1.204; liftDir (0 0 1); dragDir (1 0 0); pitchAxis (0 1 0); magUInf {u:.6g}; lRef {L:.6g}; Aref {max(W*H,.5):.6g}; writeControl timeStep; writeInterval 10; }} }}""")
 write(case/"system"/"fvSchemes","""FoamFile { version 2.0; format ascii; class dictionary; object fvSchemes; }
ddtSchemes { default steadyState; } gradSchemes { default Gauss linear; }
divSchemes { default none; div(phi,U) bounded Gauss linearUpwind grad(U); div(phi,k) bounded Gauss upwind; div(phi,epsilon) bounded Gauss upwind; div((nuEff*dev2(T(grad(U))))) Gauss linear; }
laplacianSchemes { default Gauss linear corrected; } interpolationSchemes { default linear; } snGradSchemes { default corrected; } wallDist { method meshWave; }""")
 write(case/"system"/"fvSolution","""FoamFile { version 2.0; format ascii; class dictionary; object fvSolution; }
solvers { p { solver GAMG; tolerance 1e-7; relTol .05; smoother GaussSeidel; } U { solver smoothSolver; smoother symGaussSeidel; tolerance 1e-8; relTol .1; } "(k|epsilon)" { solver smoothSolver; smoother symGaussSeidel; tolerance 1e-8; relTol .1; } }
SIMPLE { nNonOrthogonalCorrectors 0; residualControl { p 1e-3; U 1e-4; "(k|epsilon)" 1e-4; } }
relaxationFactors { fields { p .3; } equations { U .7; k .7; epsilon .7; } }""")
 write(case/"constant"/"transportProperties","""FoamFile { version 2.0; format ascii; class dictionary; object transportProperties; }
transportModel Newtonian; nu [0 2 -1 0 0 0 0] 1.5e-05;""")
 write(case/"constant"/"turbulenceProperties","""FoamFile { version 2.0; format ascii; class dictionary; object turbulenceProperties; }
simulationType RAS; RAS { RASModel kEpsilon; turbulence on; printCoeffs on; }""")
 U=f"({u:.6g} 0 0)"
 write(case/"0"/"U",f"""FoamFile {{ version 2.0; format ascii; class volVectorField; object U; }}
dimensions [0 1 -1 0 0 0 0]; internalField uniform {U};
boundaryField {{ inlet {{ type fixedValue; value uniform {U}; }} outlet {{ type zeroGradient; }} ground {{ type fixedValue; value uniform {U}; }} top {{ type slip; }} sides {{ type symmetryPlane; }} car {{ type noSlip; }} }}""")
 write(case/"0"/"p","""FoamFile { version 2.0; format ascii; class volScalarField; object p; }
dimensions [0 2 -2 0 0 0 0]; internalField uniform 0;
boundaryField { inlet { type zeroGradient; } outlet { type fixedValue; value uniform 0; } ground { type zeroGradient; } top { type zeroGradient; } sides { type symmetryPlane; } car { type zeroGradient; } }""")
 for name,dim,internal,inlet,wall in [
  ("k","[0 2 -2 0 0 0 0]","0.01","fixedValue; value uniform 0.01;","kqRWallFunction; value uniform 0.01;"),
  ("epsilon","[0 2 -3 0 0 0 0]","0.1","fixedValue; value uniform 0.1;","epsilonWallFunction; value uniform 0.1;"),
  ("nut","[0 2 -1 0 0 0 0]","0","calculated; value uniform 0;","nutkWallFunction; value uniform 0;")]:
  write(case/"0"/name,f"""FoamFile {{ version 2.0; format ascii; class volScalarField; object {name}; }}
dimensions {dim}; internalField uniform {internal};
boundaryField {{ inlet {{ type {inlet} }} outlet {{ type zeroGradient; }} ground {{ type {wall} }} top {{ type calculated; value uniform 0; }} sides {{ type symmetryPlane; }} car {{ type {wall} }} }}""")
 update(d,status="meshing",progress=12,message="Génération du maillage externe avec blockMesh et snappyHexMesh.",case_path="case")
 wsl=shutil.which("wsl.exe") or shutil.which("wsl")
 if not wsl: raise RuntimeError("WSL introuvable.")
 casew=subprocess.run([wsl,"wslpath","-a",str(case)],capture_output=True,text=True,timeout=15,check=True).stdout.strip()
 script=r'''set -e
for f in /opt/openfoam*/etc/bashrc /usr/lib/openfoam/openfoam*/etc/bashrc /usr/share/openfoam/etc/bashrc; do [ ! -f "$f" ] || . "$f"; done
command -v blockMesh >/dev/null; command -v snappyHexMesh >/dev/null; command -v simpleFoam >/dev/null
cd "$1"; blockMesh; snappyHexMesh -overwrite; checkMesh; simpleFoam
if command -v foamToVTK >/dev/null; then foamToVTK -latestTime -ascii; fi'''
 log=d/"solver.log"
 update(d,status="running",progress=18,message="OpenFOAM calcule le maillage puis l'écoulement.")
 with log.open("w",encoding="utf-8",errors="replace") as f: result=subprocess.run([wsl,"bash","-lc",script,"aerolab",casew],stdout=f,stderr=subprocess.STDOUT,check=False)
 if result.returncode:
  tail=log.read_text(encoding="utf-8",errors="replace")[-3000:]
  update(d,status="failed",progress=100,message="OpenFOAM a arrêté le calcul en erreur. Télécharge le journal pour voir le détail.",error_tail=tail); return
 update(d,status="completed",progress=100,message="Calcul CFD terminé. Les champs exportés sont dans l'archive.",completed_unix=time.time())
 with zipfile.ZipFile(d/"results.zip","w",zipfile.ZIP_DEFLATED) as z:
  for p in case.rglob("*"):
   if p.is_file() and (p.suffix.lower() in {".vtk",".dat",".csv",".stl",".txt"} or p.name in {"controlDict","fvSchemes","fvSolution","blockMeshDict","snappyHexMeshDict","U","p","k","epsilon","nut","transportProperties","turbulenceProperties"}): z.write(p,p.relative_to(d))
  if log.exists(): z.write(log,"solver.log")
if __name__=="__main__":
 try: run(sys.argv[1],float(sys.argv[2]))
 except Exception as e:
  try:
   d=(JOBS/sys.argv[1]).resolve()
   if d.parent==JOBS.resolve() and d.exists(): update(d,status="failed",progress=100,message=str(e),error=str(e),traceback=traceback.format_exc()[-3000:])
  except Exception: pass
  sys.exit(1)
