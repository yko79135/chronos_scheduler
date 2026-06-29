import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { importClasses, importConstraints, expandGrades } from '../importer.js';
import { solve, SolverNotImplementedError } from '../solver.js';

const classCsv = readFileSync('수업_목록 (2).csv', 'utf8');
const conCsv = readFileSync('스케줄_제약_템플릿.csv', 'utf8');

describe('CSV importing', () => {
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

  test('real import expected counts and unknown constraint references', () => {
    const d = importClasses(classCsv);
    d.constraints = importConstraints(conCsv, d.classes);
    expect(d.stats.classRows).toBe(65);
    expect(d.stats.subjects).toBe(39);
    expect(d.stats.canonicalGrades).toBe(8);
    expect(d.stats.namedTeachers).toBe(9);
    expect(d.stats.rooms).toBe(15);
    expect(d.stats.meetings).toBe(97);
    expect(d.stats.periodUnits).toBe(107);
    expect(d.constraints.activeStrict).toBe(0);
    expect(d.constraints.activeAvailability).toBe(0);
    expect(d.constraints.excluded).toHaveLength(13);
    expect(d.errors).toHaveLength(0);
  });

  test('solver is explicitly disabled instead of fabricating assignments', () => {
    expect(() => solve()).toThrow(SolverNotImplementedError);
  });
});
