import test from 'node:test';import assert from 'node:assert/strict';import { parseGradeExpression } from '../scheduler/groupParser.js';
const reg=['G1','G2','G3','G4','G7E','G7K','G9','G12'];
test('range expressions expand only registered grades',()=>{assert.deepEqual(parseGradeExpression('G1-3',reg),['G1','G2','G3']);assert.deepEqual(parseGradeExpression('1-3학년',reg),['G1','G2','G3']);assert.deepEqual(parseGradeExpression('G4-12',reg),['G4','G7E','G7K','G9','G12']);});
test('plus comma and all expressions',()=>{assert.deepEqual(parseGradeExpression('G7E+G7K',reg),['G7E','G7K']);assert.deepEqual(parseGradeExpression('G1,G2,G3',reg),['G1','G2','G3']);assert.deepEqual(parseGradeExpression('All',reg),reg);});
