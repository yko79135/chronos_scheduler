const slot = (d, p) => `${d}-${p}`;
export function validateOperation(data, op) { const issues = []; const reqIds = 'requirementIds' in op ? op.requirementIds : []; for (const id of reqIds)
    if (!data.requirements.some(r => r.id === id))
        issues.push({ level: 'error', code: 'operation-target-missing', message: `작업 대상 수업 ${id}을 찾을 수 없습니다.` }); if (op.type === 'set-period-only' && op.periods.some(p => p < 1 || p > 8))
    issues.push({ level: 'error', code: 'bad-period', message: '교시는 1-8 사이여야 합니다.' }); if (op.type === 'merge-shared-class') {
    const rs = op.requirementIds.map(id => data.requirements.find(r => r.id === id)).filter(Boolean);
    if (rs.length > 1) {
        const [a] = rs;
        if (rs.some(r => r.subjectId !== a.subjectId || r.totalPeriodsPerWeek !== a.totalPeriodsPerWeek || r.meetingsPerWeek !== a.meetingsPerWeek || JSON.stringify(r.meetingLengths) !== JSON.stringify(a.meetingLengths) || r.afterSchool !== a.afterSchool || JSON.stringify(r.fixedSlots) !== JSON.stringify(a.fixedSlots)))
            issues.push({ level: 'error', code: 'incompatible-merge', message: '과목/시수/횟수가 다른 요구사항은 공동수업으로 병합할 수 없습니다.' });
    }
} return issues; }
export function previewOperation(data, op) { const errs = validateOperation(data, op); if (errs.length)
    return errs.map(e => e.message); return [`${op.type} 작업이 ${'requirementIds' in op ? op.requirementIds.length : 0}개 항목에 적용됩니다.`]; }
export function applyOperation(data, op) { const copy = JSON.parse(JSON.stringify(data)); const reqs = copy.requirements; const each = (fn) => { 'requirementIds' in op && op.requirementIds.forEach(fn); }; if (validateOperation(copy, op).some(i => i.level === 'error'))
    return copy; if (op.type === 'set-period-only')
    each(id => { const r = reqs.find(x => x.id === id); r.allowedSlots = ['월', '화', '수', '목', '금'].flatMap(d => op.periods.map(p => `${d}-${p}`)); r.afterSchool = op.periods.every(p => p === 8); }); if (op.type === 'set-fixed-slot')
    each(id => { const r = reqs.find(x => x.id === id); r.fixedSlots = [slot(op.day, op.startPeriod)]; }); if (op.type === 'set-allowed-days')
    each(id => { const r = reqs.find(x => x.id === id); r.allowedSlots = op.days.flatMap(d => [1, 2, 3, 4, 5, 6, 7, 8].map(p => slot(d, p))); }); if (op.type === 'set-teacher')
    each(id => { const r = reqs.find(x => x.id === id); r.teacherRule = op.teacherRule; r.teacherIds = op.teacherRule.type === 'fixed' ? op.teacherRule.teacherIds : []; }); if (op.type === 'merge-shared-class') {
    const rs = reqs.filter(r => op.requirementIds.includes(r.id));
    if (rs.length) {
        const keep = rs[0];
        keep.cohortIds = op.cohortIds;
        keep.gradeIds = [...new Set(rs.flatMap(r => r.gradeIds))];
        keep.sharedClass = true;
        keep.shared = true;
        keep.eventType = 'shared-class';
        keep.sourceRequirementIds = rs.flatMap(r => r.sourceRequirementIds ?? [r.id]);
        keep.splitSourceRequirements = JSON.parse(JSON.stringify(rs));
        copy.requirements = reqs.filter(r => r.id === keep.id || !op.requirementIds.includes(r.id));
    }
} if (op.type === 'split-shared-class') {
    const idx = copy.requirements.findIndex(r => r.id === op.sharedRequirementId);
    const r = copy.requirements[idx];
    if (idx >= 0 && r.splitSourceRequirements?.length) {
        copy.requirements.splice(idx, 1, ...JSON.parse(JSON.stringify(r.splitSourceRequirements)));
    }
    else
        copy.warnings.push({ level: 'warning', code: 'split-manual', message: `${op.sharedRequirementId} 공동수업 원본을 찾을 수 없습니다.` });
} return copy; }
export function undoOperation(_before, after) { return JSON.parse(JSON.stringify(after)); }
