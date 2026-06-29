import test from 'node:test';import assert from 'node:assert/strict';import { readFileSync } from 'node:fs';import { execFileSync } from 'node:child_process';import { normalizeWorkbook } from '../scheduler/normalizer.js';import { ParsedWorkbook } from '../scheduler/parser.js';import { solveSchedule } from '../scheduler/solver.js';
function loadWorkbook(path:string):ParsedWorkbook{const py=String.raw`
import sys,zipfile,xml.etree.ElementTree as ET,json,re
z=zipfile.ZipFile(sys.argv[1]);ns={'a':'http://schemas.openxmlformats.org/spreadsheetml/2006/main','r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
ss=[]
try:
 root=ET.fromstring(z.read('xl/sharedStrings.xml'))
 for si in root.findall('a:si',ns): ss.append(''.join(t.text or '' for t in si.findall('.//a:t',ns)))
except KeyError: pass
wb=ET.fromstring(z.read('xl/workbook.xml'));rels=ET.fromstring(z.read('xl/_rels/workbook.xml.rels'));relmap={x.attrib['Id']:x.attrib['Target'] for x in rels}
out={'sheetNames':[],'sheets':{},'warnings':[],'merges':{}}
def rc(addr):
 m=re.match(r'([A-Z]+)([0-9]+)',addr); col=0
 for ch in m.group(1): col=col*26+ord(ch)-64
 return int(m.group(2))-1,col-1
def cellval(c):
 t=c.attrib.get('t');v=c.find('a:v',ns)
 if v is None: return ''
 val=v.text or ''
 return ss[int(val)] if t=='s' else val
for sh in wb.findall('a:sheets/a:sheet',ns):
 name=sh.attrib['name'];out['sheetNames'].append(name);target=relmap[sh.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']];root=ET.fromstring(z.read('xl/'+target.lstrip('/xl/')));rows=[]
 for row in root.findall('a:sheetData/a:row',ns):
  r=int(row.attrib['r'])-1
  while len(rows)<=r: rows.append([])
  for c in row.findall('a:c',ns):
   rr,cc=rc(c.attrib['r'])
   while len(rows[rr])<=cc: rows[rr].append({'v':''})
   rows[rr][cc]={'v':cellval(c)}
 out['sheets'][name]=rows;out['merges'][name]=[]
print(json.dumps(out,ensure_ascii=False))`;
return JSON.parse(execFileSync('python3',['-c',py,path],{encoding:'utf8'}));}

test('real workbook imports nonzero requirements and all rule sections without modifying file',()=>{const before=readFileSync('reference/schedule_input.xlsx');const d=normalizeWorkbook(loadWorkbook('reference/schedule_input.xlsx'));const after=readFileSync('reference/schedule_input.xlsx');assert.deepEqual(after,before);assert.equal(d.sourceSheets[0],'학년별');assert.deepEqual(d.grades.map(g=>g.name).sort(),['G1','G12','G2','G3','G4','G7E','G7K','G9'].sort());assert.equal(d.diagnostics.gradeBlocks.length,8);assert((d.diagnostics.rawCourseRows??0)>100);assert(d.subjects.length>0);assert(d.requirements.length>0);assert(d.requirements.reduce((a,r)=>a+r.meetingLengths.length,0)>0);assert((d.diagnostics.parsedRules?.fullTimeTeachers.length??0)>0);assert((d.diagnostics.parsedRules?.eighthPeriod.length??0)>20);assert((d.diagnostics.parsedRules?.fixed.length??0)>=6);assert((d.diagnostics.parsedRules?.afternoon.length??0)>=1);assert((d.diagnostics.parsedRules?.consecutive.length??0)>30);});

test('real workbook solver returns nonblank schedule or explicit diagnostics',()=>{const d=normalizeWorkbook(loadWorkbook('reference/schedule_input.xlsx'));const r=solveSchedule(d,{maxNodes:20000,maxSeconds:5,seed:42,allowUnassigned:true,weights:{unassigned:10000}});assert(r.assignments.length>0);assert.equal(r.progress.seed,42);assert.equal(r.assignments.some(a=>a.slot.endsWith('-8')&&d.requirements.find(x=>x.id===a.instanceId.replace(/_\d+$/,''))?.afterSchool),true);});
