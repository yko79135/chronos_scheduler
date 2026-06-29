import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { importClasses, importConstraints, expandGrades, populatedConstraintTemplate } from '../importer.js';
import { preflight, solve } from '../solver.js';

const classCsv = readFileSync('수업_목록 (2)(1).csv', 'utf8');
const conflictCsv = readFileSync('populated_constraints.csv', 'utf8');
const correctedCsv = readFileSync('populated_constraints_no_conflicting_strict.csv', 'utf8');

describe('CSV importing and scheduling', () => {
  test('UTF-8 BOM CSV import and quoted comma fields', () => {
    const d = importClasses('\uFEFF수업 ID,과목,학년,교사,강의실,주당 시수,연속 수업,방과후 수업,오전 선호,오후 선호\na,"Quoted, Subject","G1, G3",민진,R,1,,,,');
    expect(d.classes[0].subject).toBe('Quoted, Subject');
    expect(d.classes[0].grades).toEqual(['G1', 'G3']);
  });
  test('exact grade expansion examples', () => {
    expect(expandGrades('G7')).toEqual(['G7E', 'G7K']);
    expect(expandGrades('G9-12')).toEqual(['G9', 'G12']);
    expect(expandGrades('G7-12')).toEqual(['G7E', 'G7K', 'G9', 'G12']);
    expect(expandGrades('G4-12')).toEqual(['G4', 'G7E', 'G7K', 'G9', 'G12']);
    expect(expandGrades('G3-6')).toEqual(['G3', 'G4']);
    expect(expandGrades('G1-3')).toEqual(['G1', 'G2', 'G3']);
    expect(expandGrades('모든 학생')).toHaveLength(8);
  });
  test('real import expected counts', () => {
    const d = importClasses(classCsv);
    expect(d.stats.classRows).toBe(65); expect(d.stats.subjects).toBe(39); expect(d.stats.canonicalGrades).toBe(8); expect(d.stats.namedTeachers).toBe(9); expect(d.stats.rooms).toBe(15); expect(d.stats.meetings).toBe(97); expect(d.stats.periodUnits).toBe(107); expect(d.errors).toHaveLength(0);
  });
  test('populated template does not invent active fixed placements', () => {
    const d = importClasses(classCsv); const text = populatedConstraintTemplate(d.classes); const c = importConstraints(text, d.classes);
    expect(c.activeStrict).toBe(0); expect(c.activeAvailability).toBe(45);
  });
  test('conflicting constraints disable generation in preflight', () => {
    const d = importClasses(classCsv); d.constraints = importConstraints(conflictCsv, d.classes); const p = preflight(d.classes, d.constraints);
    expect(d.constraints.activeStrict).toBe(3); expect(d.constraints.activeAvailability).toBe(45); expect(p.errors.join('\n')).toContain('Fixed-placement conflict at Monday period 1'); expect(p.errors.join('\n')).toContain('Grade G4'); expect(p.errors.join('\n')).toContain('Teacher 이은총'); expect(p.errors.join('\n')).toContain('Room Love');
  });
  test('corrected constraints solve all meetings with zero hard conflicts', () => {
    const d = importClasses(classCsv); d.constraints = importConstraints(correctedCsv, d.classes); expect(d.constraints.activeStrict).toBe(0); expect(d.constraints.activeAvailability).toBe(45); expect(preflight(d.classes,d.constraints).errors).toHaveLength(0); const r=solve(d.classes,d.constraints); expect(['FEASIBLE','OPTIMAL']).toContain(r.status); expect(r.diagnostics.assignedMeetings).toBe(97); expect(r.diagnostics.gradeConflicts).toBe(0); expect(r.diagnostics.teacherConflicts).toBe(0); expect(r.diagnostics.roomConflicts).toBe(0);
  });
});
