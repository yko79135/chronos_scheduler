import { CourseRequirement, NormalizedData, ScheduleConstraint, TeacherRule } from './types.js';

const sorted=(xs:string[]|undefined)=>[...(xs??[])].sort();
const uniqSorted=(xs:string[])=>[...new Set(xs)].sort();
function canonRule(rule:TeacherRule|undefined, fallback:string[]){
  const r=rule??(fallback.length?{type:'fixed',teacherIds:fallback} as TeacherRule:{type:'none'} as TeacherRule);
  if(r.type==='fixed')return {type:r.type,teacherIds:sorted(r.teacherIds)};
  if(r.type==='choose-one')return {type:r.type,candidateTeacherIds:sorted(r.candidateTeacherIds),semantics:'choose-one'};
  if(r.type==='role')return {type:r.type,roleId:r.roleId};
  return {type:r.type};
}
function constraintSemantics(data:NormalizedData,r:CourseRequirement){
  return data.constraints.filter(c=>(c.targetRequirementIds??c.targetIds??[]).includes(r.id)&&c.hard).map(c=>({type:c.type,value:c.value})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
}
export function sharedCompatibilitySignature(data:NormalizedData,r:CourseRequirement):string{
  const rule=canonRule(r.teacherRule,r.teacherIds);
  const homeroomGradeGuard=rule.type==='role'&&rule.roleId==='homeroom'?sorted(r.gradeIds):[];
  return JSON.stringify({
    subjectId:r.subjectId,
    totalPeriodsPerWeek:r.totalPeriodsPerWeek,
    meetingsPerWeek:r.meetingsPerWeek,
    meetingLengths:[...r.meetingLengths],
    teacherRule:rule,
    teacherIds:sorted(r.teacherIds),
    roleGradeGuard:homeroomGradeGuard,
    afterSchool:r.afterSchool,
    fixedSlots:sorted(r.fixedSlots),
    allowedSlots:sorted(r.allowedSlots),
    forbiddenSlots:sorted(r.forbiddenSlots),
    preferredSlots:sorted(r.preferredSlots),
    linkedNextRequirementId:Boolean(r.linkedNextRequirementId),
    linkedPreviousRequirementId:Boolean(r.linkedPreviousRequirementId),
    hardConstraints:constraintSemantics(data,r),
    roomId:r.roomId??'',
    eventType:r.eventType
  });
}
export function explainIncompatibility(data:NormalizedData,rs:CourseRequirement[]):string{
  if(rs.length<2)return 'At least two requirements are required.';
  const [a]=rs;
  for(const r of rs.slice(1)){
    if(r.subjectId!==a.subjectId)return 'Merge rejected: subjects differ.';
    if(JSON.stringify(canonRule(r.teacherRule,r.teacherIds))!==JSON.stringify(canonRule(a.teacherRule,a.teacherIds))){
      const show=(x:CourseRequirement)=>JSON.stringify(canonRule(x.teacherRule,x.teacherIds));
      return `Merge rejected: teacher sets differ. ${a.id} uses ${show(a)}, while ${r.id} uses ${show(r)}.`;
    }
    if(sharedCompatibilitySignature(data,r)!==sharedCompatibilitySignature(data,a))return 'Merge rejected: hard scheduling semantics differ.';
  }
  return '';
}
export function buildSharedSuggestions(data:NormalizedData){
  const suggestions=[] as NonNullable<NormalizedData['diagnostics']['sharedSuggestions']>;
  const bySubject=new Map<string,CourseRequirement[]>();
  for(const r of data.requirements)bySubject.set(r.subjectId,[...(bySubject.get(r.subjectId)??[]),r]);
  for(const [subjectId,list] of bySubject){
    if(list.length<2)continue;
    const partitions=new Map<string,CourseRequirement[]>();
    for(const r of list)partitions.set(sharedCompatibilitySignature(data,r),[...(partitions.get(sharedCompatibilitySignature(data,r))??[]),r]);
    let n=0;
    for(const group of partitions.values())if(group.length>=2){
      const excluded=list.filter(r=>!group.includes(r));
      suggestions.push({id:`sug_${subjectId}_${++n}`,subjectId,requirementIds:group.map(r=>r.id),cohortIds:uniqSorted(group.flatMap(r=>r.cohortIds)),reason:excluded.length?`Compatible subgroup; ${excluded.length} same-subject requirement(s) excluded because hard semantics differ.`:'Compatible subgroup with matching hard scheduling semantics.',decision:'separate'});
    }
  }
  return suggestions;
}
export function remapConstraints(constraints:ScheduleConstraint[],fromIds:string[],toId:string){
  const from=new Set(fromIds);
  const out:ScheduleConstraint[]=[]; const seen=new Set<string>();
  for(const c of constraints){
    const ids=c.targetRequirementIds??c.targetIds;
    let next={...c} as ScheduleConstraint;
    if(ids?.some(id=>from.has(id))){
      const mapped=uniqSorted(ids.map(id=>from.has(id)?toId:id));
      next={...next,targetRequirementIds:mapped}; delete next.targetIds;
    }
    const key=JSON.stringify({type:next.type,targetRequirementIds:next.targetRequirementIds??next.targetIds,value:next.value,hard:next.hard,source:next.source});
    if(!seen.has(key)){seen.add(key);out.push(next)}
  }
  return out;
}
