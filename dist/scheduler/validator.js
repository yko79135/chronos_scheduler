export function uniqueIssues(issues) { const seen = new Set(); return issues.filter(i => { const k = `${i.level}|${i.code}|${i.message}`; if (seen.has(k))
    return false; seen.add(k); return true; }); }
export function combineIssues(...groups) { return uniqueIssues(groups.flat()); }
export function isImportBlockingIssue(i) { return i.level === 'error' && !['unresolved-teacher-role', 'missing-homeroom-mapping', 'missing-student-council-mapping', 'invalid-teacher-mapping', 'unassigned'].includes(i.code); }
export function validateData(data) { const out = [...data.errors, ...data.warnings]; const teacherIds = new Set(data.teachers.map(t => t.id)); for (const r of data.requirements) {
    if (r.teacherRule?.type === 'role') {
        if (r.teacherRule.roleId === 'homeroom') {
            const gids = r.gradeIds.length ? r.gradeIds : r.cohortIds.flatMap(c => data.cohorts.find(x => x.id === c)?.gradeIds ?? []);
            for (const gid of gids) {
                const mapped = data.roleMappings?.homeroomByGrade?.[gid];
                if (!mapped)
                    out.push({ level: 'error', code: 'missing-homeroom-mapping', message: `${data.grades.find(g => g.id === gid)?.name ?? gid} 홈룸 교사 매핑이 필요합니다.` });
                else if (!teacherIds.has(mapped))
                    out.push({ level: 'error', code: 'invalid-teacher-mapping', message: `${data.grades.find(g => g.id === gid)?.name ?? gid} 홈룸 교사 매핑이 유효하지 않습니다.` });
            }
        }
        else if (r.teacherRule.roleId === 'student-council') {
            const mapped = data.roleMappings?.studentCouncil;
            if (!mapped)
                out.push({ level: 'error', code: 'missing-student-council-mapping', message: '학생회 담당 교사 매핑이 필요합니다.' });
            else if (!teacherIds.has(mapped))
                out.push({ level: 'error', code: 'invalid-teacher-mapping', message: '학생회 담당 교사 매핑이 유효하지 않습니다.' });
        }
        else
            out.push({ level: 'error', code: 'unresolved-teacher-role', message: `${r.id} 역할 교사(${r.teacherRule.roleId}) 매핑이 필요합니다.` });
    }
    if (!r.teacherIds.length && !r.teacherRule && r.eventType === 'normal-class')
        out.push({ level: 'warning', code: 'missing-teacher', message: `${r.id} 담당 교사가 없습니다.` });
    if (r.afterSchool && r.meetingLengths.some(l => l > 1))
        out.push({ level: 'error', code: 'period8-block-too-long', message: `${r.id} 8교시 전용 수업은 1교시 블록이어야 합니다.` });
    if (r.totalPeriodsPerWeek !== r.meetingLengths.reduce((a, b) => a + b, 0))
        out.push({ level: 'error', code: 'hours-mismatch', message: `${r.id} 블록 합계가 요구 시수와 다릅니다.` });
} return uniqueIssues(out); }
export function validateResult(data, result) { const out = []; const ids = new Set(data.requirements.flatMap(r => r.meetingLengths.map((_, i) => `${r.id}_${i + 1}`))); for (const a of result.assignments)
    if (!ids.has(a.instanceId))
        out.push({ level: 'error', code: 'unknown-assignment', message: `알 수 없는 배정 ${a.instanceId}` }); return uniqueIssues(out); }
