import { cellText, num } from './parser.js';
import { canonicalGradeName, parseGradeExpression, stableId } from './groupParser.js';
import { defaultTimeSlots } from './time.js';
const sub = (name) => ({ id: stableId('sub', name), name: name.trim(), aliases: [] });
const teacher = (name) => ({ id: stableId('tea', name), name: name.trim(), aliases: [], unavailableSlots: [], preferredSlots: [] });
function splitLengths(total, meetings) { if (!meetings)
    return []; const base = Math.floor(total / meetings), rem = total % meetings; return Array.from({ length: meetings }, (_, i) => base + (i < rem ? 1 : 0)).filter(n => n > 0); }
function ref(sheetName, headerRow, startColumn, sourceRow, sourceCells) { return { sheetName, headerRow: headerRow + 1, startColumn: startColumn + 1, sourceRow: sourceRow === undefined ? undefined : sourceRow + 1, sourceCells }; }
function rowHas(row, start, headers) { return headers.every((h, i) => row[start + i] === h); }
function rowTexts(rows, r) { return (rows[r] ?? []).map((c) => String(c?.v ?? '').trim()); }
function sheetRange(rows) { return { rows: rows.length, columns: rows.reduce((m, r) => Math.max(m, r.length), 0) }; }
export function normalizeWorkbook(p) {
    const issues = [...p.warnings], students = [], grades = new Map(), cohorts = new Map(), subjects = new Map(), teachers = new Map(), reqs = new Map();
    const diag = { sheetRanges: {}, headers: [], gradeBlocks: [], teacherBlocks: [], skippedBlocks: [], detectedSubjectCount: 0, detectedRequirementCount: 0, allocationTeacherAliases: [], needsMapping: [] };
    const addGrade = (name, source) => { const canon = canonicalGradeName(name) ?? name.trim(); const gid = stableId('grade', canon); if (!grades.has(gid)) {
        grades.set(gid, { id: gid, name: canon, memberGradeIds: [gid], studentIds: [], source });
        cohorts.set(stableId('cohort', canon), { id: stableId('cohort', canon), name: canon, gradeIds: [gid], studentIds: [] });
    } return gid; };
    const syncCohortStudents = () => { for (const g of grades.values()) {
        const c = cohorts.get(stableId('cohort', g.name));
        if (c)
            c.studentIds = [...g.studentIds];
    } };
    for (const [sheetName, rows] of Object.entries(p.sheets)) {
        diag.sheetRanges[sheetName] = sheetRange(rows);
        const texts = rows.map(r => r.map(c => String(c.v ?? '').trim()));
        for (let r = 0; r < texts.length; r++) {
            for (let c = 0; c < texts[r].length; c++) {
                if (rowHas(texts[r], c, ['수업', '시간', '횟수']))
                    diag.headers.push({ sheetName, headerRow: r + 1, startColumn: c + 1, kind: 'grade', headers: ['수업', '시간', '횟수'] });
                if (rowHas(texts[r], c, ['학년', '수업', '주당 시간', '주 횟수']))
                    diag.headers.push({ sheetName, headerRow: r + 1, startColumn: c + 1, kind: 'teacher', headers: ['학년', '수업', '주당 시간', '주 횟수'] });
            }
        }
        if (/학생/.test(sheetName)) {
            const hrow = texts.findIndex(row => row.some(x => /이름|성명|학생/.test(x)) && row.some(x => /학년|Grade|G\d/i.test(x)));
            if (hrow >= 0) {
                diag.headers.push({ sheetName, headerRow: hrow + 1, startColumn: 1, kind: 'student', headers: texts[hrow] });
                for (let r = hrow + 1; r < rows.length; r++) {
                    const name = cellText(rows[r], 1) || cellText(rows[r], 0);
                    const grade = cellText(rows[r], 0) || cellText(rows[r], 2);
                    if (!name || !grade)
                        continue;
                    const gid = addGrade(grade, ref(sheetName, hrow, 0, r, [`A${r + 1}`, `B${r + 1}`]));
                    const st = { id: stableId('stu', name), name, gradeId: gid, enrollments: [], exclusions: [] };
                    students.push(st);
                    grades.get(gid).studentIds.push(st.id);
                }
            }
        }
        for (const h of diag.headers.filter(h => h.sheetName === sheetName && h.kind === 'grade')) {
            const r = h.headerRow - 1, c = h.startColumn - 1;
            const g = cellText(rows[r - 1], c) || cellText(rows[r - 2], c) || sheetName;
            const gid = addGrade(g, ref(sheetName, r, c));
            diag.gradeBlocks.push({ sheetName, headerRow: r + 1, startColumn: c + 1, gradeName: grades.get(gid).name });
            let seen = 0;
            for (let rr = r + 1; rr < rows.length; rr++) {
                const s = cellText(rows[rr], c), total = num(cellText(rows[rr], c + 1)), meet = num(cellText(rows[rr], c + 2));
                if (!s) {
                    if (seen && texts[rr].slice(c, c + 3).every(x => !x))
                        break;
                    continue;
                }
                if (!total || !meet) {
                    diag.skippedBlocks.push({ sheetName, headerRow: r + 1, startColumn: c + 1, reason: `${rr + 1}행 ${s}: 시간/횟수 누락` });
                    continue;
                }
                seen++;
                const sid = stableId('sub', s);
                subjects.set(sid, sub(s));
                const coid = stableId('cohort', grades.get(gid).name);
                const id = `req_${coid}_${sid}`;
                reqs.set(id, { id, subjectId: sid, gradeIds: [gid], cohortIds: [coid], teacherIds: [], totalPeriodsPerWeek: total, meetingsPerWeek: meet, meetingLengths: splitLengths(total, meet), fixedSlots: [], allowedSlots: [], forbiddenSlots: [], preferredSlots: [], consecutive: total / meet > 1, afterSchool: /방과후|after/i.test(s), sharedClass: false, eventType: /예배|현장|발표/.test(s) ? 'fixed-event' : 'normal-class', priority: 10, source: ref(sheetName, r, c, rr, [`${s}`, `${total}`, `${meet}`]), status: 'ready', issues: [] });
            }
        }
        for (const h of diag.headers.filter(h => h.sheetName === sheetName && h.kind === 'teacher')) {
            const r = h.headerRow - 1, c = h.startColumn - 1;
            const tn = cellText(rows[r - 1], c) || cellText(rows[r - 2], c) || sheetName;
            const t = teacher(tn);
            teachers.set(t.id, t);
            diag.teacherBlocks.push({ sheetName, headerRow: r + 1, startColumn: c + 1, teacherName: tn });
            for (let rr = r + 1; rr < rows.length; rr++) {
                const ge = cellText(rows[rr], c), s = cellText(rows[rr], c + 1), total = num(cellText(rows[rr], c + 2)), meet = num(cellText(rows[rr], c + 3));
                if (!ge && !s)
                    break;
                if (!ge || !s || !total) {
                    diag.skippedBlocks.push({ sheetName, headerRow: r + 1, startColumn: c + 1, reason: `${rr + 1}행 학년/수업/시수 누락` });
                    continue;
                }
                const sid = stableId('sub', s);
                subjects.set(sid, sub(s));
                const registered = [...grades.values()].map(g => g.name);
                const names = parseGradeExpression(ge, registered);
                if (!names.length) {
                    diag.needsMapping.push(ge);
                    issues.push({ level: 'warning', code: 'grade-mapping-needed', message: `'${ge}' 학년 표현은 자동 연결이 불확실합니다.`, context: { teacher: tn, subject: s } });
                }
                const gids = names.map(g => stableId('grade', g));
                const coName = names.length ? names.join('+') : ge;
                const coid = stableId('cohort', coName);
                if (!cohorts.has(coid))
                    cohorts.set(coid, { id: coid, name: coName, gradeIds: gids, studentIds: gids.flatMap(g => grades.get(g)?.studentIds ?? []) });
                const id = `req_${coid}_${sid}`;
                const existing = reqs.get(id);
                if (existing) {
                    if (!existing.teacherIds.includes(t.id))
                        existing.teacherIds.push(t.id);
                }
                else
                    reqs.set(id, { id, subjectId: sid, gradeIds: gids, cohortIds: [coid], teacherIds: [t.id], totalPeriodsPerWeek: total, meetingsPerWeek: meet || 1, meetingLengths: splitLengths(total, meet || 1), fixedSlots: [], allowedSlots: [], forbiddenSlots: [], preferredSlots: [], consecutive: total / (meet || 1) > 1, afterSchool: /방과후|after/i.test(s), sharedClass: gids.length > 1, eventType: gids.length > 1 ? 'shared-class' : 'normal-class', priority: gids.length > 1 ? 20 : 10, source: ref(sheetName, r, c, rr, [ge, s, String(total), String(meet)]), status: names.length ? 'ready' : 'needs-mapping', issues: names.length ? [] : ['학년 매핑 필요'] });
            }
        }
        if (/과목배분/.test(sheetName)) {
            diag.headers.push({ sheetName, headerRow: 2, startColumn: 1, kind: 'allocation', headers: texts[1] ?? [] });
            for (let rr = 2; rr < rows.length; rr++) {
                const s = cellText(rows[rr], 1);
                if (!s)
                    continue;
                const sid = stableId('sub', s);
                subjects.set(sid, sub(s));
                for (let c = 2; c < (texts[1]?.length ?? 0); c++) {
                    const alias = cellText(rows[rr], c);
                    if (!alias)
                        continue;
                    diag.allocationTeacherAliases.push(alias);
                    let t = [...teachers.values()].find(x => x.name === alias || x.aliases.includes(alias));
                    if (!t) {
                        t = teacher(alias);
                        t.aliases = [alias];
                        teachers.set(t.id, t);
                        issues.push({ level: 'warning', code: 'teacher-alias', message: `과목배분의 교사 이니셜 ${alias}을 별도 교사로 등록했습니다.`, context: { subject: s } });
                    }
                }
            }
        }
    }
    syncCohortStudents();
    diag.detectedSubjectCount = subjects.size;
    diag.detectedRequirementCount = reqs.size;
    if (reqs.size === 0)
        issues.push({ level: 'error', code: 'no-course-requirements', message: '학년별 또는 교사별 수업을 인식하지 못했습니다' });
    return { students, grades: [...grades.values()], cohorts: [...cohorts.values()], teachers: [...teachers.values()], subjects: [...subjects.values()], requirements: [...reqs.values()], constraints: [], rooms: [{ id: 'room_default', name: '미지정 교실' }], timeSlots: defaultTimeSlots(), warnings: issues.filter(i => i.level === 'warning'), errors: issues.filter(i => i.level === 'error'), sourceSheets: p.sheetNames, diagnostics: diag };
}
