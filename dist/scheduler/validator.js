import { expandInstances } from './solver.js';
export function validateData(data) { const out = [...data.errors, ...data.warnings]; for (const r of data.requirements) {
    if (r.teacherRule?.type === 'role' && !data.roleMappings?.[r.teacherRule.roleId])
        out.push({ level: 'error', code: 'unresolved-teacher-role', message: `${r.id} 역할 교사(${r.teacherRule.roleId}) 매핑이 필요합니다.` });
    if (!r.teacherIds.length && !r.teacherRule && r.eventType === 'normal-class')
        out.push({ level: 'warning', code: 'missing-teacher', message: `${r.id} 담당 교사가 없습니다.` });
    if (r.afterSchool && r.meetingLengths.some(l => l > 1))
        out.push({ level: 'error', code: 'period8-block-too-long', message: `${r.id} 8교시 전용 수업은 1교시 블록이어야 합니다.` });
    if (r.totalPeriodsPerWeek !== r.meetingLengths.reduce((a, b) => a + b, 0))
        out.push({ level: 'error', code: 'hours-mismatch', message: `${r.id} 블록 합계가 요구 시수와 다릅니다.` });
} return out; }
export function validateResult(data, res) { const issues = []; const instances = expandInstances(data.requirements); const seen = new Set(); res.assignments.forEach(a => { if (seen.has(a.instanceId))
    issues.push({ level: 'error', code: 'duplicate-instance', message: `${a.instanceId} 중복 배정` }); seen.add(a.instanceId); }); instances.forEach(i => { if (!seen.has(i.id))
    issues.push({ level: 'warning', code: 'missing-instance', message: `${i.id} 미배정` }); }); return issues; }
