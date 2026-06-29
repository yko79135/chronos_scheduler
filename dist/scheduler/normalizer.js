import { cellText, num } from './parser.js';
import { canonicalGradeName, gradeNumber, parseGradeExpression, stableId } from './groupParser.js';
import { defaultTimeSlots, DAYS } from './time.js';
import { buildSharedSuggestions } from './sharedCompatibility.js';
const sub = (name) => ({ id: stableId('sub', name), name: name.trim(), aliases: [] });
const mkTeacher = (name, cat = 'part-time') => ({ id: stableId('tea', name), name: name.trim(), aliases: [], category: cat, unavailableSlots: [], preferredSlots: [] });
function splitLengths(total, meetings) { if (!meetings)
    return []; const base = Math.floor(total / meetings), rem = total % meetings; return Array.from({ length: meetings }, (_, i) => base + (i < rem ? 1 : 0)).filter(n => n > 0); }
function colName(n) { let s = ''; for (let x = n + 1; x > 0; x = Math.floor((x - 1) / 26))
    s = String.fromCharCode(65 + (x - 1) % 26) + s; return s; }
function ref(sheetName, gradeName, headerRow, startColumn, sourceRow, rawValues) { const cells = sourceRow === undefined ? [] : [0, 1, 2, 3].map(i => `${colName(startColumn + i)}${sourceRow + 1}`); return { sheetName, gradeName, headerRow: headerRow + 1, startColumn: startColumn + 1, sourceRow: sourceRow === undefined ? undefined : sourceRow + 1, cellAddresses: cells, sourceCells: cells, rawValues }; }
function rowHas(row, start, headers) { return headers.every((h, i) => row[start + i] === h); }
function sheetRange(rows) { return { rows: rows.length, columns: rows.reduce((m, r) => Math.max(m, r.length), 0) }; }
function teacherNames(v) { return v.split(/[,，]/).map(x => x.trim()).filter(Boolean); }
function parseTeacherRule(v, teachers, fullTimeIds, roles) { const raw = v.trim(); if (!raw || raw === '없음')
    return { rule: { type: 'none' }, ids: [] }; if (raw === '온라인')
    return { rule: { type: 'external' }, ids: [] }; if (raw === '모든 교사')
    return { rule: { type: 'all-teachers' }, ids: [] }; if (raw === '가능한 풀타임 교사')
    return { rule: { type: 'choose-one', candidateTeacherIds: fullTimeIds }, ids: [] }; if (raw === '각 홈룸 교사') {
    roles.add('homeroom');
    return { rule: { type: 'role', roleId: 'homeroom' }, ids: [] };
} if (raw === '학생회 담당 교사') {
    roles.add('student-council');
    return { rule: { type: 'role', roleId: 'student-council' }, ids: [] };
} const ids = teacherNames(raw).map(n => { const id = stableId('tea', n); if (!teachers.has(id))
    teachers.set(id, mkTeacher(n, /목사/.test(n) ? 'pastor' : 'part-time')); return id; }); return { rule: { type: 'fixed', teacherIds: ids }, ids }; }
const aliasPairs = [['Art', '미술'], ['Science Experiment', '과학실험'], ['Field Trip', '현장학습'], ['Math', '수학'], ['PE', '체육'], ['Worship', '예배'], ['Presentation', '발표']];
function normSub(v) { return v.normalize('NFKC').toLowerCase().replace(/[\s\p{P}]+/gu, '').trim(); }
function subjectKeys(subject) { const out = new Set([subject]); for (const [a, b] of aliasPairs) {
    if (normSub(subject) === normSub(a))
        out.add(b);
    if (normSub(subject) === normSub(b))
        out.add(a);
} return [...out]; }
function targetReqs(reqs, grades, subject) { const keys = subjectKeys(subject); return [...reqs.values()].filter(r => r.gradeIds.some(g => grades.includes(g)) && keys.some(k => r.subjectId === stableId('sub', k) || normSub(r.subjectId.replace(/^sub_/, '').replace(/_/g, ' ')) === normSub(k))).map(r => r.id); }
function ruleItems(value) { return value.split(/,(?![^()]*\))/).map(x => x.trim()).filter(Boolean); }
function fixedMatch(line) { return line.match(/^(?:(G[\dEK+\-]+)\s+)?(.+?)\s*(?:-\s*)?(월|화|수|목|금)(?:요일)?\s*(\d)(?:-(\d))?교시/); }
function mergeRequirements(reqs, id, sourceIds, cohortIds, gradeIds, shared = true) { const bases = sourceIds.map(x => reqs.get(x)).filter(Boolean); if (!bases.length)
    return; const b = bases[0]; const merged = { ...b }; merged.id = id; merged.cohortIds = cohortIds; merged.gradeIds = gradeIds; merged.sharedClass = shared; merged.shared = shared; merged.eventType = 'fixed-event'; merged.sourceRequirementIds = sourceIds; reqs.set(id, merged); sourceIds.forEach(x => { if (x !== id)
    reqs.delete(x); }); }
export function normalizeWorkbook(p) {
    const issues = [...p.warnings], students = [], grades = new Map(), cohorts = new Map(), subjects = new Map(), teachers = new Map(), reqs = new Map(), constraints = [], roles = new Set();
    const diag = { sheetRanges: {}, headers: [], gradeBlocks: [], teacherBlocks: [], skippedBlocks: [], detectedSubjectCount: 0, detectedRequirementCount: 0, allocationTeacherAliases: [], needsMapping: [], fullTimeTeacherIds: [], teacherRoles: [], rawCourseRows: 0, weeklyTotals: {}, sharedSuggestions: [], parsedRules: { fullTimeTeachers: [], eighthPeriod: [], fixed: [], afternoon: [], consecutive: [], matched: 0, ambiguous: 0, unmatched: 0, blockingErrors: [] } };
    const addGrade = (name, source) => { const canon = canonicalGradeName(name) ?? String(name).trim(); const gid = stableId('grade', canon); if (!grades.has(gid)) {
        grades.set(gid, { id: gid, name: canon, numericLevel: gradeNumber(canon), memberGradeIds: [gid], studentIds: [], source });
        cohorts.set(stableId('cohort', canon), { id: stableId('cohort', canon), name: canon, gradeIds: [gid], studentIds: [] });
    } return gid; };
    const getAllGradeIds = () => [...grades.values()].map(g => g.id);
    let fullTimeNames = [];
    for (const [sheetName, rows] of Object.entries(p.sheets)) {
        diag.sheetRanges[sheetName] = sheetRange(rows);
        const texts = rows.map(r => r.map(c => String(c.v ?? '').replace(/\s+/g, ' ').trim()));
        for (let r = 0; r < texts.length; r++)
            for (let c = 0; c < texts[r].length; c++) {
                if (rowHas(texts[r], c, ['수업', '시간', '횟수', '교사']) || rowHas(texts[r], c, ['수업', '시간', '횟수']))
                    diag.headers.push({ sheetName, headerRow: r + 1, startColumn: c + 1, kind: 'grade', headers: texts[r].slice(c, c + 4) });
                if (rowHas(texts[r], c, ['학년', '수업', '주당 시간', '주 횟수']))
                    diag.headers.push({ sheetName, headerRow: r + 1, startColumn: c + 1, kind: 'teacher', headers: ['학년', '수업', '주당 시간', '주 횟수'] });
                if (['풀타임 교사', '8교시 고정수업', '고정수업', '오후 선호 수업', '연속수업'].includes(texts[r][c]))
                    diag.headers.push({ sheetName, headerRow: r + 1, startColumn: c + 1, kind: 'rules', headers: [texts[r][c]] });
            }
        if (/학생/.test(sheetName)) {
            const hrow = texts.findIndex(row => row.some(x => /이름|성명|학생/.test(x)) && row.some(x => /학년|Grade|G\d/i.test(x)));
            if (hrow >= 0) {
                for (let rr = hrow + 1; rr < rows.length; rr++) {
                    const name = cellText(rows[rr], 1) || cellText(rows[rr], 0);
                    const grade = cellText(rows[rr], 0) || cellText(rows[rr], 2);
                    if (!name || !grade)
                        continue;
                    const gid = addGrade(grade, ref(sheetName, grade, hrow, 0, rr, [grade, name]));
                    students.push({ id: stableId('stu', name), name, gradeId: gid, enrollments: [], exclusions: [] });
                    grades.get(gid).studentIds.push(stableId('stu', name));
                }
            }
        }
        for (const h of diag.headers.filter(h => h.sheetName === sheetName && h.kind === 'rules')) {
            const r = h.headerRow - 1, c = h.startColumn - 1, label = texts[r][c], value = texts[r].slice(c + 1).filter(Boolean).join('\n');
            if (label === '풀타임 교사') {
                fullTimeNames = teacherNames(value.replace(/\n/g, ','));
                diag.parsedRules.fullTimeTeachers = fullTimeNames;
            }
        }
        fullTimeNames.forEach(n => { const id = stableId('tea', n); teachers.set(id, mkTeacher(n, 'full-time')); });
        diag.fullTimeTeacherIds = fullTimeNames.map(n => stableId('tea', n));
        for (const h of diag.headers.filter(h => h.sheetName === sheetName && h.kind === 'grade')) {
            const r = h.headerRow - 1, c = h.startColumn - 1;
            let g = '';
            for (let rr = r - 1; rr >= 0 && !g; rr--)
                g = cellText(rows[rr], c);
            const gid = addGrade(g || sheetName, ref(sheetName, g || sheetName, r, c));
            let rowCount = 0, total = 0;
            for (let rr = r + 1; rr < rows.length; rr++) {
                const s = cellText(rows[rr], c), totalRaw = cellText(rows[rr], c + 1), meetRaw = cellText(rows[rr], c + 2), teacherRaw = cellText(rows[rr], c + 3);
                if (rowHas(texts[rr] ?? [], c, ['수업', '시간', '횟수', '교사']))
                    break;
                if (s === '합계') {
                    const workbookTotal = num(totalRaw);
                    if (workbookTotal && workbookTotal !== total)
                        issues.push({ level: 'error', code: 'grade-total-mismatch', message: `${g} 합계 ${workbookTotal}와 계산값 ${total}이 다릅니다.` });
                    break;
                }
                if (!s) {
                    if (rowCount && texts[rr]?.slice(c, c + 4).every(x => !x))
                        break;
                    continue;
                }
                const tot = num(totalRaw), meet = num(meetRaw);
                if (!tot || !meet) {
                    diag.skippedBlocks.push({ sheetName, headerRow: r + 1, startColumn: c + 1, reason: `${rr + 1}행 ${s}: 시간/횟수 누락` });
                    continue;
                }
                rowCount++;
                total += tot;
                const sid = stableId('sub', s);
                subjects.set(sid, sub(s));
                const tr = parseTeacherRule(teacherRaw, teachers, diag.fullTimeTeacherIds ?? [], roles);
                const coid = stableId('cohort', grades.get(gid).name);
                const id = `req_${coid}_${sid}_${rowCount}`;
                const lengths = splitLengths(tot, meet);
                const rissues = [];
                if (tot % meet !== 0) {
                    const msg = `${grades.get(gid).name} ${s}: ${tot}교시/${meet}회가 균등 분할되지 않아 ${lengths.join('+')}로 가져왔습니다.`;
                    issues.push({ level: 'warning', code: 'uneven-meeting-lengths', message: msg });
                    rissues.push(msg);
                }
                reqs.set(id, { id, subjectId: sid, gradeIds: [gid], cohortIds: [coid], teacherIds: tr.ids, teacherRule: tr.rule, totalPeriodsPerWeek: tot, meetingsPerWeek: meet, meetingLengths: lengths, fixedSlots: [], allowedSlots: [], forbiddenSlots: [], preferredSlots: [], consecutive: lengths.some(x => x > 1), afterSchool: false, sharedClass: false, shared: false, sourceRequirementIds: [id], eventType: /예배|현장학습|발표/.test(s) ? 'fixed-event' : 'normal-class', priority: 10, source: ref(sheetName, grades.get(gid).name, r, c, rr, [s, tot, meet, teacherRaw]), status: tr.rule.type === 'role' ? 'needs-mapping' : 'ready', issues: rissues });
            }
            diag.gradeBlocks.push({ sheetName, headerRow: r + 1, startColumn: c + 1, gradeName: grades.get(gid).name, rowCount, totalPeriods: total });
            diag.rawCourseRows = (diag.rawCourseRows ?? 0) + rowCount;
            diag.weeklyTotals[grades.get(gid).name] = total;
            if (total !== 39)
                issues.push({ level: 'warning', code: 'weekly-total-not-39', message: `${grades.get(gid).name} 주당 합계가 ${total}입니다.` });
        }
        for (const h of diag.headers.filter(h => h.sheetName === sheetName && h.kind === 'teacher')) {
            const r = h.headerRow - 1, c = h.startColumn - 1;
            const tn = cellText(rows[r - 1], c) || cellText(rows[r - 2], c) || sheetName;
            const tid = stableId('tea', tn);
            if (!teachers.has(tid))
                teachers.set(tid, mkTeacher(tn));
            for (let rr = r + 1; rr < rows.length; rr++) {
                const ge = cellText(rows[rr], c), s = cellText(rows[rr], c + 1), total = num(cellText(rows[rr], c + 2)), meet = num(cellText(rows[rr], c + 3));
                if (!ge && !s)
                    break;
                if (!ge || !s || !total)
                    continue;
                const registered = [...grades.values()].map(g => g.name);
                const names = parseGradeExpression(ge, registered);
                const gids = names.map(g => stableId('grade', g));
                const coName = names.length ? names.join('+') : ge;
                const coid = stableId('cohort', coName);
                if (!cohorts.has(coid))
                    cohorts.set(coid, { id: coid, name: coName, gradeIds: gids, studentIds: [] });
                const sid = stableId('sub', s);
                subjects.set(sid, sub(s));
                reqs.set(`req_${coid}_${sid}`, { id: `req_${coid}_${sid}`, subjectId: sid, gradeIds: gids, cohortIds: [coid], teacherIds: [tid], teacherRule: { type: 'fixed', teacherIds: [tid] }, totalPeriodsPerWeek: total, meetingsPerWeek: meet || 1, meetingLengths: splitLengths(total, meet || 1), fixedSlots: [], allowedSlots: [], forbiddenSlots: [], preferredSlots: [], consecutive: total / (meet || 1) > 1, afterSchool: false, sharedClass: gids.length > 1, shared: gids.length > 1, sourceRequirementIds: [`req_${coid}_${sid}`], eventType: gids.length > 1 ? 'shared-class' : 'normal-class', priority: 10, source: ref(sheetName, undefined, r, c, rr, [ge, s, total, meet]), status: names.length ? 'ready' : 'needs-mapping', issues: names.length ? [] : ['학년 매핑 필요'] });
            }
        }
        const registered = [...grades.values()].map(g => g.name);
        const expand = (expr) => parseGradeExpression(expr, registered).map(n => stableId('grade', n));
        for (const h of diag.headers.filter(h => h.sheetName === sheetName && h.kind === 'rules')) {
            const r = h.headerRow - 1, c = h.startColumn - 1, label = texts[r][c], value = texts[r].slice(c + 1).filter(Boolean).join('\n');
            if (label === '8교시 고정수업') {
                for (const line of ruleItems(value)) {
                    diag.parsedRules.eighthPeriod.push(line);
                    const m = line.match(/^(G\d{1,2}[EK]?|G\d{1,2})\s+(.+)$/i);
                    if (!m) {
                        diag.parsedRules.unmatched++;
                        continue;
                    }
                    const gids = expand(m[1]);
                    const ids = targetReqs(reqs, gids, m[2]);
                    if (!ids.length) {
                        diag.parsedRules.unmatched++;
                        issues.push({ level: 'error', code: 'period8-unmatched', message: `8교시 고정수업 '${line}'에 일치하는 수업이 없습니다.` });
                    }
                    ids.forEach(id => { diag.parsedRules.matched++; reqs.get(id).afterSchool = true; reqs.get(id).allowedSlots = DAYS.map(d => `${d}-8`); constraints.push({ id: `con_8_${id}`, type: 'period-only', targetRequirementIds: [id], value: { periods: [8], originalText: line }, hard: true, source: 'excel' }); });
                }
            }
            if (label === '고정수업') {
                for (const line of ruleItems(value)) {
                    diag.parsedRules.fixed.push(line);
                    const m = fixedMatch(line);
                    if (!m) {
                        diag.parsedRules.unmatched++;
                        continue;
                    }
                    const subj = m[2].trim(), day = m[3], start = Number(m[4]), end = Number(m[5] ?? m[4]);
                    const gids = m[1] ? expand(m[1].replace('G7-12', 'G7-12')) : getAllGradeIds();
                    const ids = targetReqs(reqs, gids, subj);
                    if (!ids.length) {
                        diag.parsedRules.unmatched++;
                        issues.push({ level: 'error', code: 'fixed-unmatched', message: `고정수업 '${line}'에 일치하는 수업이 없습니다.` });
                    }
                    else
                        diag.parsedRules.matched += ids.length;
                    if (ids.length > 1) {
                        const coid = stableId('cohort', `${subj}_${ids.length}_shared`);
                        cohorts.set(coid, { id: coid, name: `${subj} 공동`, gradeIds: gids, studentIds: [] });
                        mergeRequirements(reqs, `shared_${stableId('sub', subj)}_${gids.slice().sort().join('_')}_${day}_${start}_${end}`, ids, [coid], gids, true);
                    }
                    const target = [...reqs.values()].filter(x => x.subjectId === stableId('sub', subj) && x.gradeIds.some(g => gids.includes(g))).map(x => x.id);
                    target.forEach(id => { const rr = reqs.get(id); rr.fixedSlots = [`${day}-${start}`]; rr.meetingLengths = [end - start + 1]; rr.meetingsPerWeek = 1; rr.totalPeriodsPerWeek = end - start + 1; rr.consecutive = end > start; rr.sharedClass = gids.length > 1; rr.eventType = 'fixed-event'; constraints.push({ id: `con_fix_${id}`, type: 'fixed-slot', targetRequirementIds: [id], value: { day, startPeriod: start, endPeriod: end, originalText: line }, hard: true, source: 'excel' }); });
                }
            }
            if (label === '오후 선호 수업') {
                for (const line of ruleItems(value)) {
                    diag.parsedRules.afternoon.push(line);
                    const m = line.match(/^(.+)\s+(.+)$/);
                    if (!m) {
                        diag.parsedRules.unmatched++;
                        continue;
                    }
                    const gids = expand(m[1]), subject = m[2];
                    const ids = targetReqs(reqs, gids, subject);
                    if (!ids.length)
                        diag.parsedRules.unmatched++;
                    ids.forEach(id => { diag.parsedRules.matched++; reqs.get(id).preferredSlots = DAYS.flatMap(d => [5, 6, 7].map(p => `${d}-${p}`)); constraints.push({ id: `con_pm_${id}`, type: 'preferred-period-range', targetRequirementIds: [id], value: { periods: [5, 6, 7], weight: 5, originalText: line }, hard: false, source: 'excel' }); });
                }
            }
            if (label === '연속수업') {
                for (const line of ruleItems(value)) {
                    diag.parsedRules.consecutive.push(line);
                    const m = line.match(/^(G\d{1,2}[EK]?)\s+(.+)\((\d+)교시(?:[·\s]*(.+))?\)$/);
                    if (!m) {
                        diag.parsedRules.unmatched++;
                        continue;
                    }
                    const gids = expand(m[1]), subject = m[2].trim(), len = Number(m[3]), note = m[4]?.trim();
                    const ids = targetReqs(reqs, gids, subject);
                    if (!ids.length) {
                        diag.parsedRules.unmatched++;
                        issues.push({ level: 'error', code: 'consecutive-unmatched', message: `연속수업 '${line}'에 일치하는 수업이 없습니다.` });
                    }
                    ids.forEach(id => { const rr = reqs.get(id); if (note && /자습|Self Study/i.test(note)) {
                        const selfName = '자습';
                        const selfSid = stableId('sub', selfName);
                        subjects.set(selfSid, sub(selfName));
                        const selfId = `${id}_self_study_linked`;
                        const teacherLed = Math.max(1, len - 1);
                        rr.meetingLengths = [teacherLed, ...splitLengths(Math.max(0, rr.totalPeriodsPerWeek - len), Math.max(0, rr.meetingsPerWeek - 1))].filter(Boolean);
                        rr.totalPeriodsPerWeek = Math.max(teacherLed, rr.totalPeriodsPerWeek - 1);
                        rr.meetingsPerWeek = rr.meetingLengths.length;
                        rr.consecutive = true;
                        rr.linkedNextRequirementId = selfId;
                        reqs.set(selfId, { ...rr, id: selfId, subjectId: selfSid, teacherIds: [], teacherRule: { type: 'none' }, totalPeriodsPerWeek: 1, meetingsPerWeek: 1, meetingLengths: [1], consecutive: false, linkedPreviousRequirementId: id, sourceRequirementIds: [selfId], status: 'ready', issues: [`복합 연속수업 '${line}'의 자습 교시`] });
                        constraints.push({ id: `con_link_${id}`, type: 'linked-consecutive', targetRequirementIds: [id, selfId], value: { originalText: line, teacherLedLength: teacherLed, selfStudyLength: 1 }, hard: true, source: 'excel' });
                    }
                    else if (note) {
                        const msg = `확인 필요: 복합 연속수업 ${line}`;
                        rr.status = 'error';
                        rr.issues = [...(rr.issues ?? []), msg];
                        diag.parsedRules.blockingErrors.push(msg);
                        issues.push({ level: 'error', code: 'composite-consecutive-unresolved', message: msg });
                    }
                    else if (rr.totalPeriodsPerWeek < len || rr.meetingsPerWeek < 1) {
                        const msg = `연속수업 '${line}'이 수업 총량과 충돌합니다.`;
                        diag.parsedRules.blockingErrors.push(msg);
                        issues.push({ level: 'error', code: 'consecutive-conflict', message: msg });
                    }
                    else {
                        rr.meetingLengths = [len, ...splitLengths(rr.totalPeriodsPerWeek - len, rr.meetingsPerWeek - 1)];
                        rr.consecutive = true;
                    } diag.parsedRules.matched++; constraints.push({ id: `con_seq_${id}`, type: 'consecutive', targetRequirementIds: [id], value: { blockLength: len, note, originalText: line }, hard: true, source: 'excel' }); });
                }
            }
        }
    }
    const roleMappings = { homeroomByGrade: Object.fromEntries([...grades.keys()].map(g => [g, ''])), studentCouncil: null };
    diag.teacherRoles = [...roles];
    const previewData = { students, grades: [...grades.values()], cohorts: [...cohorts.values()], teachers: [...teachers.values()], subjects: [...subjects.values()], requirements: [...reqs.values()], constraints, rooms: [{ id: 'room_default', name: '미지정 교실' }], timeSlots: defaultTimeSlots(), warnings: [], errors: [], sourceSheets: p.sheetNames, diagnostics: diag, roleMappings };
    diag.sharedSuggestions = buildSharedSuggestions(previewData);
    diag.detectedSubjectCount = subjects.size;
    diag.detectedRequirementCount = reqs.size;
    if (reqs.size === 0)
        issues.push({ level: 'error', code: 'no-course-requirements', message: '학년별 수업 요구사항을 인식하지 못했습니다. 빈 시간표를 생성할 수 없습니다.' });
    return { students, grades: [...grades.values()], cohorts: [...cohorts.values()], teachers: [...teachers.values()], subjects: [...subjects.values()], requirements: [...reqs.values()], constraints, rooms: [{ id: 'room_default', name: '미지정 교실' }], timeSlots: defaultTimeSlots(), warnings: issues.filter(i => i.level === 'warning'), errors: issues.filter(i => i.level === 'error'), sourceSheets: p.sheetNames, diagnostics: diag, roleMappings };
}
