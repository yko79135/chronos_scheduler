import { crossesLunch, regularSlotKeys, slotDay, slotPeriod, slotRange } from './time.js';
export function expandInstances(reqs, data) { return reqs.flatMap(r => r.meetingLengths.map((len, i) => { const cohortStudents = (r.cohortIds ?? []).flatMap(id => data?.cohorts.find(c => c.id === id)?.studentIds ?? []); const gradeStudents = (r.gradeIds ?? []).flatMap(id => data?.grades.find(g => g.id === id)?.studentIds ?? []); return { id: `${r.id}_${i + 1}`, requirementId: r.id, subjectId: r.subjectId, gradeIds: r.gradeIds ?? [], cohortIds: r.cohortIds ?? [], studentIds: [...new Set([...cohortStudents, ...gradeStudents])], teacherIds: r.teacherIds, teacherRule: r.teacherRule, roomId: r.roomId, length: len, fixedStart: r.fixedSlots[i], afterSchool: r.afterSchool, linkedNextInstanceId: i === 0 && r.linkedNextRequirementId ? `${r.linkedNextRequirementId}_1` : undefined, linkedPreviousInstanceId: i === 0 && r.linkedPreviousRequirementId ? `${r.linkedPreviousRequirementId}_1` : undefined }; })); }
function effectiveTeacherIds(inst, data, placed, start) { if (!inst.teacherRule)
    return inst.teacherIds; if (inst.teacherRule.type === 'fixed')
    return inst.teacherRule.teacherIds; if (inst.teacherRule.type === 'none' || inst.teacherRule.type === 'external')
    return []; if (inst.teacherRule.type === 'all-teachers')
    return data.teachers.filter(t => t.category !== 'external').map(t => t.id); if (inst.teacherRule.type === 'choose-one') {
    const slots = slotRange(start, inst.length);
    return [inst.teacherRule.candidateTeacherIds.find(t => !placed.some(a => a.teacherIds.includes(t) && slotRange(a.slot, a.length).some(s => slots.includes(s)))) ?? inst.teacherRule.candidateTeacherIds[0]].filter(Boolean);
} if (inst.teacherRule.type === 'role') {
    if (inst.teacherRule.roleId === 'student-council')
        return data.roleMappings?.studentCouncil ? [data.roleMappings.studentCouncil] : [];
    if (inst.teacherRule.roleId === 'homeroom') {
        const gid = inst.gradeIds[0] ?? inst.cohortIds.flatMap(c => data.cohorts.find(x => x.id === c)?.gradeIds ?? [])[0];
        const mapped = gid ? data.roleMappings?.homeroomByGrade?.[gid] : undefined;
        return mapped ? [mapped] : [];
    }
    return [];
} return inst.teacherIds; }
function canPlace(a, inst, start, data) { const reasons = []; const slots = slotRange(start, inst.length); const teachers = effectiveTeacherIds(inst, data, a, start); if (crossesLunch(start, inst.length))
    reasons.push('lunch-crossing'); if (!inst.afterSchool && slots.some(s => slotPeriod(s) > 7))
    reasons.push('period-8-restriction'); if (inst.afterSchool && slots.some(s => slotPeriod(s) !== 8))
    reasons.push('period-8-only'); for (const s of slots) {
    for (const x of a) {
        if (!slotRange(x.slot, x.length).includes(s))
            continue;
        if (teachers.some(t => x.teacherIds.includes(t)))
            reasons.push(`teacher-conflict ${s}`);
        if (inst.studentIds.length && x.studentIds.length ? inst.studentIds.some(st => x.studentIds.includes(st)) : inst.gradeIds.some(g => x.gradeIds.includes(g)) || inst.cohortIds.some(c => x.cohortIds.includes(c)))
            reasons.push(`participant-conflict ${s}`);
        if (inst.roomId && x.roomId && inst.roomId === x.roomId)
            reasons.push(`room-conflict ${s}`);
    }
} const req = data.requirements.find(r => r.id === inst.requirementId); if (req?.forbiddenSlots.some(s => slots.includes(s)))
    reasons.push('forbidden-slot'); return [...new Set(reasons)]; }
function candidates(inst, data) { if (inst.fixedStart)
    return [inst.fixedStart]; const starts = regularSlotKeys(inst.afterSchool).filter(s => slotPeriod(s) + inst.length - 1 <= 8 && !crossesLunch(s, inst.length)); const req = data.requirements.find(r => r.id === inst.requirementId); const allowed = req?.allowedSlots.length ? req.allowedSlots : starts; return starts.filter(s => allowed.includes(s)); }
function score(a) { let p = 0; const byKey = new Map(); for (const x of a) {
    for (const g of x.gradeIds)
        byKey.set(`g:${g}:${x.subjectId}`, [...(byKey.get(`g:${g}:${x.subjectId}`) ?? []), ['월', '화', '수', '목', '금'].indexOf(slotDay(x.slot))]);
    for (const t of x.teacherIds)
        byKey.set(`t:${t}:${slotDay(x.slot)}`, [...(byKey.get(`t:${t}:${slotDay(x.slot)}`) ?? []), slotPeriod(x.slot)]);
} byKey.forEach(v => { if (new Set(v).size < v.length)
    p += 10; v.sort((a, b) => a - b); for (let i = 1; i < v.length; i++)
    if (v[i] - v[i - 1] > 1)
        p += 1; }); return -p; }
function cmp(a, b) { return a.periods - b.periods || a.instances - b.instances || a.priority - b.priority || a.soft - b.soft; }
function objective(a, data) { const req = (id) => data.requirements.find(r => r.id === id.replace(/_\d+$/, '')); return { periods: a.reduce((n, x) => n + x.length, 0), instances: a.length, priority: a.reduce((n, x) => n + (req(x.instanceId)?.priority ?? 0), 0), soft: score(a) }; }
function better(a, b, data) { return cmp(objective(a, data), objective(b, data)) > 0; }
export function solveSchedule(data, opt) { const now = opt.now ?? (() => Date.now()); const start = now(); let nodes = 0, backtracks = 0; const issues = []; let limit = null; const candCount = new Map(); const all = expandInstances(data.requirements, data).sort((a, b) => candidates(a, data).length - candidates(b, data).length || b.length - a.length || b.gradeIds.length - a.gradeIds.length); all.forEach(i => candCount.set(i.id, candidates(i, data).length)); const totalPeriods = all.reduce((n, i) => n + i.length, 0); let best = []; let exhausted = true; function asn(inst, s, placed) { return { instanceId: inst.id, slot: s, length: inst.length, subjectId: inst.subjectId, gradeIds: inst.gradeIds, teacherIds: effectiveTeacherIds(inst, data, placed, s), roomId: inst.roomId, cohortIds: inst.cohortIds, studentIds: inst.studentIds, linkedNextInstanceId: inst.linkedNextInstanceId, linkedPreviousInstanceId: inst.linkedPreviousInstanceId }; } function update(placed) { if (better(placed, best, data))
    best = [...placed]; } function remainingFrom(idx, placed) { const assigned = new Set(placed.map(a => a.instanceId)); const rem = all.slice(idx).filter(i => !assigned.has(i.id) && !i.linkedPreviousInstanceId); return { periods: rem.reduce((n, i) => n + i.length + (i.linkedNextInstanceId ? (all.find(x => x.id === i.linkedNextInstanceId)?.length ?? 0) : 0), 0), instances: rem.reduce((n, i) => n + 1 + (i.linkedNextInstanceId ? 1 : 0), 0), priority: rem.reduce((n, i) => n + (data.requirements.find(r => r.id === i.requirementId)?.priority ?? 0) + (i.linkedNextInstanceId ? (data.requirements.find(r => r.id === (all.find(x => x.id === i.linkedNextInstanceId)?.requirementId ?? ''))?.priority ?? 0) : 0), 0) }; } function checkLimit() { if (nodes >= opt.maxNodes) {
    limit = 'node-limit';
    exhausted = false;
    return true;
} if (now() - start >= opt.maxSeconds * 1000) {
    limit = 'time-limit';
    exhausted = false;
    return true;
} return false; } function search(idx, placed) { nodes++; if (checkLimit())
    return false; update(placed); if (best.length === all.length)
    return true; const rem = remainingFrom(idx, placed); const bestObj = objective(best, data), cur = objective(placed, data); if (cmp({ periods: cur.periods + rem.periods, instances: cur.instances + rem.instances, priority: cur.priority + rem.priority, soft: Number.POSITIVE_INFINITY }, bestObj) <= 0) {
    backtracks++;
    return false;
} if (idx >= all.length)
    return false; const inst = all[idx]; if (placed.some(a => a.instanceId === inst.id) || inst.linkedPreviousInstanceId)
    return search(idx + 1, placed); const sorted = candidates(inst, data).sort((a, b) => slotPeriod(a) - slotPeriod(b)); for (const s of sorted) {
    const why = canPlace(placed, inst, s, data);
    if (why.length === 0) {
        const first = asn(inst, s, placed);
        let nextPlaced = [...placed, first];
        if (inst.linkedNextInstanceId) {
            const next = all.find(x => x.id === inst.linkedNextInstanceId);
            const ns = slotRange(s, inst.length).at(-1).replace(/-(\d+)$/, (_, p) => `-${Number(p) + 1}`);
            if (!next || slotDay(ns) !== slotDay(s) || canPlace(nextPlaced, next, ns, data).length) {
                continue;
            }
            nextPlaced = [...nextPlaced, asn(next, ns, nextPlaced)];
        }
        if (search(idx + 1, nextPlaced))
            return true;
    }
} backtracks++; return opt.allowUnassigned ? search(idx + 1, placed) : false; } search(0, []); const assigned = new Set(best.map(a => a.instanceId)); const unassigned = all.filter(i => !assigned.has(i.id)); const bestIds = new Set(best.map(a => a.instanceId)); for (const u of unassigned) {
    if (u.linkedPreviousInstanceId && bestIds.has(u.linkedPreviousInstanceId))
        continue;
    const rs = candidates(u, data).flatMap(s => canPlace(best, u, s, data));
    const base = candCount.get(u.id) === 0 ? 'no-available-candidate-slots' : u.fixedStart ? 'fixed-slot-conflict' : rs.length ? [...new Set(rs)].slice(0, 4).join(', ') : (u.linkedPreviousInstanceId || u.linkedNextInstanceId) ? 'linked-requirement-failure' : limit ? 'search-budget-exhausted-before-placement' : 'not selected in best partial';
    issues.push({ level: 'error', code: 'unassigned', message: `${u.id} 배정 실패: ${base}` });
} const obj = objective(best, data); const reason = unassigned.length === 0 ? 'complete' : limit ?? (exhausted ? 'optimal-partial' : 'partial-search-exhausted'); return { assignments: best, unassigned, issues, score: obj.soft, progress: { elapsedMs: now() - start, nodes, backtracks, assigned: best.length, total: all.length, unassigned: unassigned.length, assignedPeriods: obj.periods, totalPeriods, unassignedPeriods: totalPeriods - obj.periods, bestScore: obj.soft, reason, seed: opt.seed } }; }
export { canPlace, candidates, objective };
