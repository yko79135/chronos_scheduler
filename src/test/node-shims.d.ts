declare module 'node:test' { const test: (name:string, fn:()=>void|Promise<void>)=>void; export default test; }
declare module 'node:assert/strict' { interface Assert { (v:unknown):void; deepEqual:(a:unknown,b:unknown)=>void; equal:(a:unknown,b:unknown)=>void; ok:(v:unknown)=>void; } const assert: Assert; export default assert; }
declare module 'node:fs' { export function readFileSync(path:string): Uint8Array; }
declare module 'node:child_process' { export function execFileSync(cmd:string,args:string[],opts:{encoding:'utf8'}): string; }
