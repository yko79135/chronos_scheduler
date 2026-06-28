import { cellText, num } from './parser.js';
import { parseGradeExpression, stableId } from './groupParser.js';
import { defaultTimeSlots } from './time.js';
const sub = (name) => ({ id: stableId('sub', name), name: name.trim(), aliases: [] });
const teacher = (name) => ({ id: stableId('tea', name), name: name.trim(), aliases: [], unavailableSlots: [], preferredSlots: [] });
function splitLengths(total, meetings) { if (!meetings)
    return []; const base = Math.floor(total / meetings), rem = total % meetings; return Array.from({ length: meetings }, (_, i) => base + (i < rem ? 1 : 0)).filter(n => n > 0); }
export function normalizeWorkbook(p) {
    const issues = [...p.warnings], students = [], grades = new Map(), subjects = new Map(), teachers = new Map(), reqs = new Map();
    const studentRows = p.sheets['학생별 학년'] ?? [];
    const headers = studentRows[2]?.map(c => String(c.v ?? '').trim()) ?? [];
    for (let r = 3; r < studentRows.length; r++) {
        const name = cellText(studentRows[r], 1), grade = cellText(studentRows[r], 0) || cellText(studentRows[r], 2);
        if (!name || !grade)
            continue;
        const gid = stableId('grade', grade);
        if (!grades.has(gid))
            grades.set(gid, { id: gid, name: grade, memberGradeIds: [gid], studentIds: [] });
        const enroll = [], exclusions = [];
        headers.slice(3).forEach((h, i) => { const val = cellText(studentRows[r], i + 3); if (h && val) {
            const sid = stableId('sub', h);
            subjects.set(sid, sub(h));
            if (/^(x|no|제외|-)/i.test(val))
                exclusions.push(sid);
            else
                enroll.push(sid);
        } });
        const st = { id: stableId('stu', name), name, gradeId: gid, enrollments: enroll, exclusions };
        students.push(st);
        grades.get(gid).studentIds.push(st.id);
    }
    const gradeRows = p.sheets['학년별'] ?? [];
    for (let c = 0; c < (gradeRows[1]?.length ?? 0); c += 4) {
        const g = cellText(gradeRows[1], c);
        if (!g || cellText(gradeRows[2], c) !== '수업')
            continue;
        const gid = stableId('grade', g);
        if (!grades.has(gid))
            grades.set(gid, { id: gid, name: g, memberGradeIds: [gid], studentIds: [] });
        for (let r = 3; r < gradeRows.length; r++) {
            const s = cellText(gradeRows[r], c), total = num(cellText(gradeRows[r], c + 1)), meet = num(cellText(gradeRows[r], c + 2));
            if (!s || !total || !meet)
                continue;
            const sid = stableId('sub', s);
            subjects.set(sid, sub(s));
            const id = `req_${gid}_${sid}`;
            reqs.set(id, { id, subjectId: sid, gradeIds: [gid], teacherIds: [], totalPeriodsPerWeek: total, meetingsPerWeek: meet, meetingLengths: splitLengths(total, meet), roomId: undefined, fixedSlots: [], allowedSlots: [], forbiddenSlots: [], preferredSlots: [], consecutive: total / meet > 1, afterSchool: /방과후|after/i.test(s), sharedClass: false, eventType: 'normal-class', priority: 10 });
            if (total % meet !== 0)
                issues.push({ level: 'warning', code: 'uneven-meeting-length', message: `${g} ${s}: 총 ${total}교시/${meet}회는 균등 분할되지 않아 [${splitLengths(total, meet).join(', ')}] 후보로 표시됩니다.`, context: { grade: g, subject: s } });
        }
    }
    const registered = [...grades.values()].map(g => g.name);
    const teacherRows = p.sheets['교사별'] ?? [];
    for (let c = 0; c < (teacherRows[1]?.length ?? 0); c++) {
        const tn = cellText(teacherRows[1], c);
        if (!tn || cellText(teacherRows[2], c) !== '학년')
            continue;
        const t = teacher(tn);
        teachers.set(t.id, t);
        for (let r = 3; r < teacherRows.length; r++) {
            const ge = cellText(teacherRows[r], c), s = cellText(teacherRows[r], c + 1), total = num(cellText(teacherRows[r], c + 2)), meet = num(cellText(teacherRows[r], c + 3));
            if (!ge || !s || !total)
                continue;
            const sid = stableId('sub', s);
            subjects.set(sid, sub(s));
            const gids = parseGradeExpression(ge, registered).map(g => stableId('grade', g));
            if (gids.length === 0)
                issues.push({ level: 'warning', code: 'unknown-grade', message: `교사별 시트의 '${ge}' 학년을 등록 학년과 연결할 수 없습니다.`, context: { teacher: tn, subject: s } });
            const id = `req_${gids.join('_')}_${sid}`;
            const existing = reqs.get(id);
            if (existing) {
                if (!existing.teacherIds.includes(t.id))
                    existing.teacherIds.push(t.id);
                if (existing.totalPeriodsPerWeek !== total)
                    issues.push({ level: 'warning', code: 'teacher-grade-hours-mismatch', message: `${tn} ${ge} ${s}의 교사별 시수(${total})와 학년별 시수가 다릅니다.` });
            }
            else
                reqs.set(id, { id, subjectId: sid, gradeIds: gids, teacherIds: [t.id], totalPeriodsPerWeek: total, meetingsPerWeek: meet || 1, meetingLengths: splitLengths(total, meet || 1), fixedSlots: [], allowedSlots: [], forbiddenSlots: [], preferredSlots: [], consecutive: total / (meet || 1) > 1, afterSchool: /방과후|after/i.test(s), sharedClass: gids.length > 1, eventType: gids.length > 1 ? 'shared-class' : 'normal-class', priority: gids.length > 1 ? 20 : 10 });
        }
    }
    const alloc = p.sheets['과목배분'] ?? [];
    const allocGrades = (alloc[1] ?? []).map(c => String(c.v ?? '').trim());
    for (let r = 2; r < alloc.length; r++) {
        const s = cellText(alloc[r], 1);
        if (!s)
            continue;
        const sid = stableId('sub', s);
        for (let c = 2; c < allocGrades.length; c++) {
            const alias = cellText(alloc[r], c);
            if (!alias)
                continue;
            const gname = allocGrades[c];
            const gid = stableId('grade', gname.replace(/-\d\([EK]\)/, ''));
            let t = [...teachers.values()].find(x => x.name === alias || x.aliases.includes(alias));
            if (!t) {
                t = teacher(alias);
                t.aliases = [alias];
                teachers.set(t.id, t);
                issues.push({ level: 'warning', code: 'teacher-alias', message: `과목배분의 교사 이니셜 ${alias}을 별도 교사로 등록했습니다.`, context: { subject: s, grade: gname } });
            }
            [...reqs.values()].filter(q => q.subjectId === sid && q.gradeIds.includes(gid)).forEach(q => { if (q.teacherIds.length && !q.teacherIds.includes(t.id))
                issues.push({ level: 'warning', code: 'teacher-conflict', message: `${gname} ${s} 담당 교사가 교사별/과목배분에서 다릅니다.` }); if (!q.teacherIds.includes(t.id))
                q.teacherIds.push(t.id); });
        }
    }
    return { students, grades: [...grades.values()], teachers: [...teachers.values()], subjects: [...subjects.values()], requirements: [...reqs.values()], rooms: [{ id: 'room_default', name: '미지정 교실' }], timeSlots: defaultTimeSlots(), warnings: issues.filter(i => i.level === 'warning'), errors: issues.filter(i => i.level === 'error'), sourceSheets: p.sheetNames };
}
