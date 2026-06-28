declare module 'node:test' { const test: (name:string, fn:()=>void|Promise<void>)=>void; export default test; }
declare module 'node:assert/strict' { interface Assert { (v:unknown):void; deepEqual:(a:unknown,b:unknown)=>void; equal:(a:unknown,b:unknown)=>void; ok:(v:unknown)=>void; } const assert: Assert; export default assert; }
