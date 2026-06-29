import { slotRange } from './time.js';
const slots = (a) => slotRange(a.slot, a.length);
function actualFor(ids, as) { return as.filter(a => ids.includes(a.instanceId.replace(/_\d+$/, ''))).map(a => `${a.instanceId}@${a.slot}${a.length > 1 ? `-${slots(a).at(-1)}` : ''}`).join(', ') || '미배정'; }
export function auditSchedule(data, result) {
    const items = [];
    const as = result.assignments;
    const add = (i) => items.push(i);
    for (const c of data.constraints) {
        const ids = c.targetRequirementIds ?? c.targetIds ?? [];
        const original = String(c.value?.originalText ?? c.id);
        if (c.type === 'fixed-slot') {
            const v = c.value;
            const expected = `${v.day}-${v.startPeriod}`;
            const passed = ids.every(id => as.some(a => a.instanceId.startsWith(`${id}_`) && a.slot === expected));
            add({ category: 'hard', ruleType: 'Fixed-slot rule', originalText: original, target: ids.join(', '), expected, actual: actualFor(ids, as), passed, message: passed ? 'Fixed class is placed at the required slot.' : 'Fixed class is missing or placed at a different slot.' });
        }
        else if (c.type === 'period-only') {
            const periods = c.value.periods ?? [8];
            const passed = ids.every(id => as.filter(a => a.instanceId.startsWith(`${id}_`)).every(a => slots(a).every(s => periods.includes(Number(s.split('-')[1])))));
            add({ category: 'hard', ruleType: 'Period-8-only rule', originalText: original, target: ids.join(', '), expected: `periods ${periods.join(',')}`, actual: actualFor(ids, as), passed, message: passed ? 'All assigned meetings use the required periods.' : 'A meeting is outside the required period.' });
        }
        else if (c.type === 'consecutive' || c.type === 'linked-consecutive') {
            const passed = ids.every(id => as.filter(a => a.instanceId.startsWith(`${id}_`)).every(a => a.length > 1 || c.type === 'linked-consecutive'));
            add({ category: 'hard', ruleType: c.type === 'linked-consecutive' ? 'Linked Math/Self Study rule' : 'Consecutive-block rule', originalText: original, target: ids.join(', '), expected: 'consecutive placement', actual: actualFor(ids, as), passed, message: passed ? 'Consecutive requirement is represented in the result.' : 'Consecutive requirement is not satisfied.' });
        }
        else if (c.type === 'preferred-period-range') {
            const periods = c.value.periods ?? [5, 6, 7];
            const assigned = as.filter(a => ids.includes(a.instanceId.replace(/_\d+$/, '')));
            const good = assigned.filter(a => slots(a).every(s => periods.includes(Number(s.split('-')[1])))).length;
            add({ category: 'soft', ruleType: 'Afternoon preference', originalText: original, target: ids.join(', '), expected: `periods ${periods.join(',')}`, actual: `${good}/${assigned.length} meetings preferred; ${actualFor(ids, as)}`, passed: assigned.length > 0 && good === assigned.length, message: `${good} of ${assigned.length} assigned meetings satisfy the preference.` });
        }
    }
    const occ = new Map();
    for (const a of as)
        for (const s of slots(a)) {
            for (const t of a.teacherIds)
                occ.set(`t:${t}:${s}`, [...(occ.get(`t:${t}:${s}`) ?? []), a]);
            for (const g of a.gradeIds)
                occ.set(`g:${g}:${s}`, [...(occ.get(`g:${g}:${s}`) ?? []), a]);
            if (a.roomId)
                occ.set(`r:${a.roomId}:${s}`, [...(occ.get(`r:${a.roomId}:${s}`) ?? []), a]);
        }
    let tc = 0, pc = 0, rc = 0;
    for (const [k, v] of occ)
        if (v.length > 1) {
            if (k.startsWith('t:'))
                tc++;
            else if (k.startsWith('g:'))
                pc++;
            else
                rc++;
        }
    add({ category: 'hard', ruleType: 'Teacher conflicts', originalText: 'post-schedule validation', target: 'all assignments', expected: '0 conflicts', actual: String(tc), passed: tc === 0, message: `Teacher conflicts: ${tc}` });
    add({ category: 'hard', ruleType: 'Grade/cohort/student conflicts', originalText: 'post-schedule validation', target: 'all assignments', expected: '0 conflicts', actual: String(pc), passed: pc === 0, message: `Participant conflicts: ${pc}` });
    add({ category: 'hard', ruleType: 'Room conflicts', originalText: 'post-schedule validation', target: 'all assignments', expected: '0 conflicts', actual: String(rc), passed: rc === 0, message: `Room conflicts: ${rc}` });
    const hard = items.filter(i => i.category === 'hard'), soft = items.filter(i => i.category === 'soft');
    return { items, summary: { hardPassed: hard.filter(i => i.passed).length, hardTotal: hard.length, hardFailed: hard.filter(i => !i.passed).length, softSatisfied: soft.filter(i => i.passed).length, softTotal: soft.length, teacherConflicts: tc, participantConflicts: pc, roomConflicts: rc } };
}
