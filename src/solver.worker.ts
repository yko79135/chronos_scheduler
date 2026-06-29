import { solve } from './solver.js';
let cancelled=false;
self.onmessage=(e)=>{ if(e.data?.type==='cancel'){cancelled=true; return;} cancelled=false; try{postMessage(solve(e.data.classes,e.data.constraints,()=>cancelled));}catch(err){postMessage({status:'SOLVER_ERROR',messages:[err instanceof Error?err.message:String(err)],assignments:[],diagnostics:{},elapsedMs:0,variableCount:0,constraintCount:0,objectiveValue:0,preferenceViolations:0});}};
