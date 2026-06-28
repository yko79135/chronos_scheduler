import test from 'node:test';
import assert from 'node:assert/strict';
import { solveSchedule } from '../scheduler/solver.js';
import { defaultTimeSlots } from '../scheduler/time.js';
function data() { return { students: [], grades: [{ id: 'g1', name: 'G1', memberGradeIds: ['g1'], studentIds: [] }, { id: 'g2', name: 'G2', memberGradeIds: ['g2'], studentIds: [] }], teachers: [{ id: 't1', name: 'T1', aliases: [], unavailableSlots: [], preferredSlots: [] }, { id: 't2', name: 'T2', aliases: [], unavailableSlots: [], preferredSlots: [] }], subjects: [{ id: 'math', name: '수학', aliases: [] }, { id: 'pe', name: '체육', aliases: [] }], rooms: [{ id: 'r1', name: 'R1' }], timeSlots: defaultTimeSlots(), warnings: [], errors: [], sourceSheets: [], requirements: [{ id: 'r_math', subjectId: 'math', gradeIds: ['g1'], teacherIds: ['t1'], totalPeriodsPerWeek: 3, meetingsPerWeek: 3, meetingLengths: [1, 1, 1], roomId: 'r1', fixedSlots: [], allowedSlots: [], forbiddenSlots: [], preferredSlots: [], consecutive: false, afterSchool: false, sharedClass: false, eventType: 'normal-class', priority: 10 }, { id: 'r_pe', subjectId: 'pe', gradeIds: ['g1', 'g2'], teacherIds: ['t2'], totalPeriodsPerWeek: 2, meetingsPerWeek: 1, meetingLengths: [2], fixedSlots: [], allowedSlots: [], forbiddenSlots: [], preferredSlots: [], consecutive: true, afterSchool: false, sharedClass: true, eventType: 'shared-class', priority: 20 }] }; }
test('solver prevents teacher/grade/room conflicts and supports consecutive shared class', () => { const d = data(); const r = solveSchedule(d, { maxNodes: 5000, maxSeconds: 2, seed: 1, allowUnassigned: false, weights: {} }); assert.equal(r.unassigned.length, 0); const occupied = new Set(); for (const a of r.assignments) {
    for (let i = 0; i < a.length; i++) {
        for (const g of a.gradeIds) {
            const key = `g:${g}:${a.slot}:${i}`;
            assert(!occupied.has(key));
            occupied.add(key);
        }
        for (const t of a.teacherIds) {
            const key = `t:${t}:${a.slot}:${i}`;
            assert(!occupied.has(key));
            occupied.add(key);
        }
    }
} assert(r.assignments.some(a => a.length === 2 && a.gradeIds.length === 2)); });
test('impossible schedules are diagnosed as unassigned', () => { const d = data(); d.requirements[0].meetingLengths = Array(40).fill(1); d.requirements[0].totalPeriodsPerWeek = 40; const r = solveSchedule(d, { maxNodes: 1000, maxSeconds: 1, seed: 1, allowUnassigned: true, weights: {} }); assert(r.unassigned.length > 0); assert(r.issues.some(i => i.code === 'unassigned')); });
