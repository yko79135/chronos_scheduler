import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { importClasses, importConstraints } from '../importer.js';
import { solve } from '../solver.js';
test('browser workflow equivalent: upload CSVs, exclude template rows, generate, export', () => { const d = importClasses(readFileSync('수업_목록 (2).csv', 'utf8')); d.constraints = importConstraints(readFileSync('스케줄_제약_템플릿.csv', 'utf8'), d.classes); assert.equal(d.stats.classRows, 65); assert.equal(d.stats.meetings, 97); assert.equal(d.constraints.excluded.length, 13); const r = solve(d); assert.equal(r.assignments.length, 97); assert.equal(r.diagnostics.gradeConflicts + r.diagnostics.teacherConflicts + r.diagnostics.roomConflicts, 0); assert.ok(JSON.stringify({ d, r }).includes('assignments')); });
