import { parseCsv, toCsv } from './csv.js';
import { DAYS, GRADES, TEACHERS } from './model.js';
const headers = ['수업 ID', '과목', '학년', '교사', '강의실', '주당 시수', '연속 수업', '방과후 수업', '오전 선호', '오후 선호'];
export function expandGrades(expr) { expr = expr.trim(); if (expr === '모든 학생')
    return [...GRADES]; const out = new Set(); for (const raw of expr.split(',')) {
    const p = raw.trim();
    if (!p)
        continue;
    if (p === 'G7') {
        out.add('G7E');
        out.add('G7K');
        continue;
    }
    if (p === 'G7E' || p === 'G7K') {
        out.add(p);
        continue;
    }
    const norm = p.replace(/^G(\d+)-G(\d+)$/, 'G$1-$2');
    const m = norm.match(/^G(\d+)(?:-(\d+))?$/);
    if (!m) {
        throw new Error(`Unknown grade expression: ${p}`);
    }
    const a = +m[1], b = m[2] ? +m[2] : a;
    for (const g of GRADES) {
        const n = +g.match(/\d+/)[0];
        if (n >= a && n <= b)
            out.add(g);
    }
} if (!out.size)
    throw new Error(`Unknown grade expression: ${expr}`); return GRADES.filter(g => out.has(g)); }
function flag(v, id, name, errors) { if (!['', 'Y', 'N'].includes(v))
    errors.push(`${id}: ${name} must be blank, N, or Y`); return v === 'Y'; }
function teacherSem(cell, errors) { if (cell === '모든 교사')
    return { kind: 'all', teachers: [...TEACHERS], eligible: [...TEACHERS] }; if (cell === '가능한 교사')
    return { kind: 'flex', teachers: [], eligible: [...TEACHERS] }; const parts = cell.split(',').map(s => s.trim()).filter(Boolean); const bad = parts.filter(p => !TEACHERS.includes(p)); if (bad.length)
    errors.push(`Unknown teacher: ${bad.join(', ')}`); return { kind: parts.length > 1 ? 'co' : 'named', teachers: parts, eligible: parts }; }
export function importClasses(text) {
    const rows = parseCsv(text), errors = [], warnings = [];
    const missing = headers.filter(h => !(h in (rows[0] || {})));
    if (missing.length)
        errors.push(`Missing required headers: ${missing.join(', ')}`);
    const seen = new Set();
    const classes = [];
    for (const [i, r] of rows.entries()) {
        const id = r['수업 ID'];
        if (!id)
            errors.push(`Row ${i + 2}: 수업 ID is required`);
        if (seen.has(id))
            errors.push(`Duplicate class ID: ${id}`);
        seen.add(id);
        if (!r['과목'])
            errors.push(`${id}: subject is required`);
        let grades = [];
        try {
            grades = expandGrades(r['학년']);
        }
        catch (e) {
            errors.push(`${id}: ${e.message}`);
        }
        if (!r['교사'])
            errors.push(`${id}: teacher is required`);
        if (!r['강의실'])
            errors.push(`${id}: room is required`);
        const weekly = Number(r['주당 시수']);
        if (!Number.isInteger(weekly) || weekly <= 0)
            errors.push(`${id}: weekly periods must be positive integer`);
        const consecutive = flag(r['연속 수업'], id, '연속 수업', errors), after = flag(r['방과후 수업'], id, '방과후 수업', errors), morning = flag(r['오전 선호'], id, '오전 선호', errors), afternoon = flag(r['오후 선호'], id, '오후 선호', errors);
        if (morning && afternoon)
            errors.push(`${id}: 오전 선호 and 오후 선호 cannot both be Y`);
        if (consecutive && after && weekly > 1)
            errors.push(`${id}: consecutive after-school blocks longer than one period are unsupported`);
        const meetings = Array.from({ length: consecutive ? 1 : weekly }, (_, k) => ({ id: `${id}#${k + 1}`, classId: id, index: k, length: consecutive ? weekly : 1 }));
        classes.push({ id, subject: r['과목'], gradeExpr: r['학년'], grades, teacherCell: r['교사'], teacher: teacherSem(r['교사'], errors), room: r['강의실'], weekly, consecutive, afterSchool: after, morning, afternoon, meetings });
    }
    return { classes, errors, warnings, stats: stats(classes) };
}
export function stats(classes) { const gradeLoads = Object.fromEntries(GRADES.map(g => [g, { regular: 0, after: 0 }])); for (const c of classes)
    for (const g of c.grades)
        gradeLoads[g][c.afterSchool ? 'after' : 'regular'] += c.weekly; return { classRows: classes.length, subjects: new Set(classes.map(c => c.subject)).size, canonicalGrades: GRADES.length, namedTeachers: TEACHERS.length, rooms: new Set(classes.map(c => c.room)).size, meetings: classes.reduce((a, c) => a + c.meetings.length, 0), periodUnits: classes.reduce((a, c) => a + c.weekly, 0), consecutiveBlocks: classes.filter(c => c.consecutive).length, afterSchoolRows: classes.filter(c => c.afterSchool).length, afterSchoolPeriods: classes.filter(c => c.afterSchool).reduce((a, c) => a + c.weekly, 0), gradeLoads }; }
export function defaultAvailability() { return Object.fromEntries(TEACHERS.map(t => [t, Object.fromEntries(DAYS.map(d => [d, Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].map(p => [p, true]))]))])); }
export function importConstraints(text, classes) { const rows = parseCsv(text), classIds = new Set(classes.map(c => c.id)), excluded = [], warnings = [], strict = []; let unmatchedStrict = 0, unknownTeacherAvailability = 0, activeAvailability = 0; const av = defaultAvailability(); const dayMap = { Monday: 'Monday', Tuesday: 'Tuesday', Wednesday: 'Wednesday', Thursday: 'Thursday', Friday: 'Friday', '월': 'Monday', '월요일': 'Monday', '화': 'Tuesday', '화요일': 'Tuesday', '수': 'Wednesday', '수요일': 'Wednesday', '목': 'Thursday', '목요일': 'Thursday', '금': 'Friday', '금요일': 'Friday' }; for (const [i, r] of rows.entries()) {
    if (r['제약 유형'] === 'STRICT') {
        if (!classIds.has(r['수업 ID'])) {
            unmatchedStrict++;
            excluded.push({ type: 'STRICT', reason: 'unmatched class ID', row: i + 2 });
            continue;
        }
        strict.push({ classId: r['수업 ID'], day: dayMap[r['고정 요일']], start: Number(r['고정 시작 교시']) });
    }
    else if (r['제약 유형'] === 'TEACHER_AVAILABILITY') {
        const t = r['교사'];
        if (!TEACHERS.includes(t)) {
            unknownTeacherAvailability++;
            excluded.push({ type: 'TEACHER_AVAILABILITY', reason: 'unknown teacher', row: i + 2 });
            continue;
        }
        activeAvailability++;
        const d = dayMap[r['요일']];
        if (!d) {
            excluded.push({ type: 'TEACHER_AVAILABILITY', reason: 'unknown day', row: i + 2 });
            continue;
        }
        for (let p = 1; p <= 8; p++)
            av[t][d][p] = r[`${p}교시`] !== 'N';
    }
} if (excluded.length === 13)
    warnings.push('This appears to be an example constraint template. Thirteen rows do not reference the imported class list and were excluded.'); return { strict, availability: av, excluded, warnings, activeStrict: strict.length, activeAvailability, unmatchedStrict, unknownTeacherAvailability }; }
export function populatedConstraintTemplate(classes) { const h = ['제약 유형', '수업 ID', '고정 요일', '고정 시작 교시', '교사', '요일', '1교시', '2교시', '3교시', '4교시', '5교시', '6교시', '7교시', '8교시']; const rows = []; for (const c of classes.slice(0, 3))
    rows.push({ '제약 유형': 'STRICT', '수업 ID': c.id, '고정 요일': 'Monday', '고정 시작 교시': 1 }); for (const t of TEACHERS)
    for (const d of DAYS)
        rows.push({ '제약 유형': 'TEACHER_AVAILABILITY', '교사': t, '요일': d, '1교시': 'Y', '2교시': 'Y', '3교시': 'Y', '4교시': 'Y', '5교시': 'Y', '6교시': 'Y', '7교시': 'Y', '8교시': 'Y' }); return toCsv(rows, h); }
