import { parseWorkbookFile } from './scheduler/parser.js';
import { normalizeWorkbook } from './scheduler/normalizer.js';
import { combineIssues, isImportBlockingIssue, uniqueIssues, validateData, validateResult } from './scheduler/validator.js';
import { auditSchedule } from './scheduler/audit.js';
import { analyzeFeasibility } from './scheduler/feasibility.js';
import { applyOperation, validateOperation } from './scheduler/operations.js';
import { exportExcel, loadProject, printPdf, saveProject } from './scheduler/exporter.js';
import { DAYS, slotRange } from './scheduler/time.js';
let data = null;
let previousFeasibilityScore = null;
let activeWorker = null;
let latestSnapshot = null;
let result = null;
let solveStatus = 'Ready';
let solveError = '';
let audit = null;
const app = document.querySelector('#app');
const nameOf = (id, kind) => { if (!data)
    return id; const list = kind === 'subject' ? data.subjects : kind === 'teacher' ? data.teachers : kind === 'cohort' ? data.cohorts : data.grades; return list.find(x => x.id === id)?.name ?? id; };
function card(title, value, cls = '') { return `<section class="card ${cls}"><b>${title}</b><strong>${value}</strong></section>`; }
function sourceCell(r) { return `${r.source?.sheetName ?? ''} ${r.source?.sourceCells?.join(', ') ?? (r.source?.sourceRow ? `R${r.source.sourceRow}C${r.source.startColumn}` : '')}`; }
function requirementsPreview() { if (!data)
    return ''; return `<section class="panel"><h2>수업 요구사항</h2>${data.requirements.length === 0 ? '<p class="error">학년별 또는 교사별 수업을 인식하지 못했습니다. 시간표 생성이 비활성화되었습니다.</p>' : ''}<table><thead><tr><th>과목</th><th>참여 그룹</th><th>담당 교사</th><th>주당 총 교시</th><th>주간 횟수</th><th>블록 길이</th><th>원본 시트</th><th>원본 셀</th><th>상태</th><th>문제점</th></tr></thead><tbody>${data.requirements.map(r => `<tr><td>${nameOf(r.subjectId, 'subject')}</td><td>${r.cohortIds.map(c => nameOf(c, 'cohort')).join(', ') || r.gradeIds.map(g => nameOf(g, 'grade')).join(', ')}</td><td>${r.teacherIds.map(t => nameOf(t, 'teacher')).join(', ') || '미지정'}</td><td>${r.totalPeriodsPerWeek}</td><td>${r.meetingsPerWeek}</td><td>${r.meetingLengths.join('+')}</td><td>${r.source?.sheetName ?? ''}</td><td>${sourceCell(r)}</td><td>${r.status ?? 'ready'}</td><td>${r.issues?.join(', ') ?? ''}</td></tr>`).join('')}</tbody></table></section>`; }
function constraintEditor() { if (!data)
    return ''; return `<section class="panel"><h2>제약조건 편집</h2><p>AI 없이도 같은 constraint operations 모델로 고정, 허용/금지, 8교시 전용, 담당 교사와 cohort 변경, 배치 잠금/해제를 저장할 수 있습니다.</p><label>수업 <select id="cr">${data.requirements.map(r => `<option value="${r.id}">${nameOf(r.subjectId, 'subject')} / ${r.cohortIds.map(c => nameOf(c, 'cohort')).join(', ')}</option>`).join('')}</select></label><label>요일 <select id="day">${DAYS.map(d => `<option>${d}</option>`).join('')}</select></label><label>교시 <input id="period" type="number" min="1" max="8" value="1"></label><button id="fix">정확한 요일·교시에 고정</button><button id="after">8교시 전용</button><button id="allow">허용 시간 추가</button><button id="forbid">금지 시간 추가</button></section>`; }
function feasibilityPanel() { if (!data)
    return ''; const f = analyzeFeasibility(data); const delta = previousFeasibilityScore === null ? '' : f.score < previousFeasibilityScore ? '개선됨' : f.score > previousFeasibilityScore ? '악화됨' : '변화 없음'; previousFeasibilityScore = f.score; const rows = (loads) => loads.map(l => `<tr class="${l.regularOverload || l.period8Overload ? 'error' : ''}"><td>${l.name}</td><td>${l.regularRequired}/35</td><td>${l.period8Required}/5</td><td>${l.regularOverload}</td><td>${l.period8Overload}</td><td>${l.contributions.map(c => `${c.label}:${c.periods}`).join('<br>')}</td></tr>`).join(''); return `<section class="panel" id="feasibility"><h2>Feasibility / 배정 가능성 분석</h2><p>상태 변화: <b>${delta}</b>. Teacher regular overload ${f.metrics.teacherRegularOverload}; Teacher period-8 overload ${f.metrics.teacherPeriod8Overload}; Grade overload ${f.metrics.gradeRegularOverload + f.metrics.gradePeriod8Overload}; Zero-candidate requirements ${f.metrics.zeroCandidateRequirements}. Solver partial result와 별개로 구조적 과부하와 hard conflict를 먼저 표시합니다.</p><h3>Grade capacity</h3><table><thead><tr><th>학년</th><th>정규 필요/용량</th><th>8교시 필요/용량</th><th>정규 초과</th><th>8교시 초과</th><th>기여 수업</th></tr></thead><tbody>${rows(f.gradeLoads)}</tbody></table><h3>Teacher capacity</h3><table><thead><tr><th>교사</th><th>정규 필요/용량</th><th>8교시 필요/용량</th><th>정규 초과</th><th>8교시 초과</th><th>기여 수업</th></tr></thead><tbody>${rows(f.teacherLoads)}</tbody></table><h3>Other feasibility checks</h3>${f.issues.map(i => `<p class="${i.level}">● [${i.code}] ${i.message}</p>`).join('') || '<p>명시적 구조 문제 없음</p>'}</section>`; }
function sharedPanel() { if (!data)
    return ''; const sugg = data.diagnostics.sharedSuggestions ?? []; const req = (id) => data.requirements.find(r => r.id === id); return `<section class="panel" id="shared"><h2>공동수업 설정</h2><p>두 개 이상의 compatible 요구사항을 선택해 하나의 schedulable shared class로 병합하거나, 병합 수업을 다시 분리할 수 있습니다. 같은 과목도 여러 그룹으로 나눌 수 있습니다.</p><button id="apply-safe">Preview compatible suggestions</button><div>${sugg.map(s => `<article class="card"><b>${nameOf(s.subjectId, 'subject')}</b><p>${s.reason}</p><p>Grades: ${s.requirementIds.flatMap(id => req(id)?.gradeIds ?? []).map(g => nameOf(g, 'grade')).join(', ')}</p><p>Estimated class-instance reduction: ${Math.max(0, s.requirementIds.length - 1)}</p><button class="merge-suggestion" data-ids="${s.requirementIds.join(',')}" data-cohorts="${s.cohortIds.join(',')}">Merge this compatible group</button></article>`).join('')}</div><table><thead><tr><th>선택</th><th>Subject</th><th>Grades</th><th>Teacher/rule</th><th>Weekly</th><th>Meetings</th><th>Lengths</th><th>Fixed</th><th>8교시</th><th>Warnings</th></tr></thead><tbody>${sugg.flatMap(su => su.requirementIds.map(id => { const r = req(id); if (!r)
    return ''; const teacher = r.teacherIds.map(t => nameOf(t, 'teacher')).join(', ') || r.teacherRule?.type || '미지정'; return `<tr><td><input class="share-pick" type="checkbox" value="${id}"></td><td>${nameOf(r.subjectId, 'subject')}</td><td>${r.gradeIds.map(g => nameOf(g, 'grade')).join(', ')}</td><td>${teacher}</td><td>${r.totalPeriodsPerWeek}</td><td>${r.meetingsPerWeek}</td><td>${r.meetingLengths.join('+')}</td><td>${r.fixedSlots.join(', ') || '-'}</td><td>${r.afterSchool ? '전용' : '-'}</td><td>${validateOperation(data, { type: 'merge-shared-class', requirementIds: su.requirementIds, cohortIds: su.cohortIds }).map(i => i.message).join('; ')}</td></tr>`; })).join('')}</tbody></table><button id="merge-shared">선택 병합</button><h3>Existing shared classes</h3>${data.requirements.filter(r => r.sharedClass || r.shared).map(r => `<p>${nameOf(r.subjectId, 'subject')} / ${r.gradeIds.map(g => nameOf(g, 'grade')).join(', ')} ${r.mergeMetadata?.origin === 'user' ? `<button class="split-shared" data-id="${r.id}">분리</button>` : '<span>Excel fixed shared event</span>'}</p>`).join('') || '<p>없음</p>'}</section>`; }
function teacherMappings() { if (!data)
    return ''; const opts = (sel) => `<option value="">-- 선택 --</option>${data.teachers.map(t => `<option value="${t.id}" ${sel === t.id ? 'selected' : ''}>${t.name}</option>`).join('')}`; const homeroom = data.roleMappings?.homeroomByGrade ?? {}; return `<section class="panel"><h2>Teacher mappings / 교사 매핑</h2><p>역할 교사를 실제 교사로 매핑하면 검증과 시간표 생성에 즉시 반영됩니다.</p><h3>각 홈룸 교사</h3><table><tbody>${data.grades.map(g => `<tr><th>${g.name}</th><td><select class="map-home" data-grade="${g.id}">${opts(homeroom[g.id])}</select></td></tr>`).join('')}</tbody></table><h3>학생회 담당 교사</h3><select id="map-council">${opts(data.roleMappings?.studentCouncil)}</select></section>`; }
function ruleReview() { if (!data)
    return ''; const pr = data.diagnostics.parsedRules; const status = (kind, x) => { const cons = data.constraints.filter(c => String(c.value?.originalText ?? '') === x); if (cons.length)
    return cons.every(c => c.hard) ? 'Parsed and enforced' : 'Parsed as soft preference'; return kind === '오후 선호 수업' ? 'Parsed but unresolved' : 'Unmatched'; }; const targets = (x) => data.constraints.filter(c => String(c.value?.originalText ?? '') === x).flatMap(c => c.targetRequirementIds ?? c.targetIds ?? []).join(', ') || '-'; const row = (kind, items) => `<h3>${kind}</h3><table><thead><tr><th>원본</th><th>상태</th><th>매칭 요구사항</th></tr></thead><tbody>${items.map(x => `<tr><td>${x}</td><td>${status(kind, x)}</td><td>${targets(x)}</td></tr>`).join('')}</tbody></table>`; return `<section class="panel"><h2>자동 감지 제약조건</h2>${pr ? `<p>matched ${pr.matched}, ambiguous ${pr.ambiguous}, unmatched ${pr.unmatched}, blocking ${pr.blockingErrors.length}</p><p>상태는 Excel에서 읽힘, 요구사항 변환, solver 적용, 사후 검증 가능 여부를 구분합니다.</p>${row('고정수업', pr.fixed)}${row('8교시 고정수업', pr.eighthPeriod)}${row('연속수업', pr.consecutive)}${row('오후 선호 수업', pr.afternoon)}${pr.blockingErrors.map(e => `<p class="error">${e}</p>`).join('')}` : '<p>감지된 규칙 없음</p>'}</section>`; }
function diagnostics() { if (!data)
    return ''; const d = data.diagnostics; return `<section class="panel"><h2>Import 진단</h2><pre>${JSON.stringify({ sheetRanges: d.sheetRanges, headers: d.headers, gradeBlocks: d.gradeBlocks, teacherBlocks: d.teacherBlocks, skippedBlocks: d.skippedBlocks, detectedSubjectCount: d.detectedSubjectCount, detectedRequirementCount: d.detectedRequirementCount, allocationTeacherAliases: [...new Set(d.allocationTeacherAliases)] }, null, 2)}</pre></section>`; }
function tableFor(filter, cell) { const rows = [1, 2, 3, 4, 99, 5, 6, 7, 8]; return `<table class="schedule"><thead><tr><th>교시</th><th>시간</th>${DAYS.map(d => `<th>${d}</th>`).join('')}</tr></thead><tbody>${rows.map(p => `<tr class="${p === 99 ? 'lunch' : ''}"><th>${p === 99 ? '점심' : p}</th><td>${p === 99 ? '11:55-13:05' : p === 8 ? '15:20-16:00' : p < 5 ? ['', '09:00-09:40', '09:45-10:25', '10:30-11:10', '11:15-11:55'][p] : ['', '', '', '', '', '13:05-13:45', '13:50-14:30', '14:35-15:15'][p]}</td>${DAYS.map(d => { const a = result?.assignments.find(x => filter(x) && slotRange(x.slot, x.length).includes(`${d}-${p}`)); const cont = a && a.slot !== `${d}-${p}`; return `<td class="${cont ? 'continuation' : ''}">${a ? (cont ? '계속<br>' : '') + cell(a) : ''}</td>`; }).join('')}</tr>`).join('')}</tbody></table>`; }
function render() { const issues = data ? uniqueIssues(validateData(data)) : []; const blockers = issues.filter(i => isImportBlockingIssue(i) || ['missing-homeroom-mapping', 'missing-student-council-mapping', 'invalid-teacher-mapping', 'unresolved-teacher-role'].includes(i.code)); const blocking = blockers.length > 0; app.innerHTML = `<header><h1>Chronos Scheduler</h1><p>Excel 기반 교사·학생·학년 시간표 자동 생성 웹앱</p></header><main><section class="panel"><h2>Excel 업로드</h2><div id="drop"><input type="file" id="file" accept=".xlsx"/><p>.xlsx 파일을 드래그하거나 선택하세요.</p></div><button id="load">저장 프로젝트 불러오기</button></section>${data ? `<section class="grid">${card('학생 수', data.students.length)}${card('canonical 학년 수', data.grades.length)}${card('교사 수', data.teachers.length)}${card('과목 수', data.subjects.length)}${card('cohort 수', data.cohorts.length)}${card('CourseRequirement 수', data.requirements.length)}${card('전체 주당 교시', data.requirements.reduce((a, b) => a + b.totalPeriodsPerWeek, 0))}${card('수업 인스턴스', data.requirements.reduce((a, b) => a + b.meetingLengths.length, 0))}${card('오류', issues.filter(i => i.level === 'error').length, 'bad')}${card('경고', issues.filter(i => i.level === 'warning').length, 'warn')}</section><section class="panel"><h2>시트 및 검증</h2><p>${data.sourceSheets.join(', ')}</p><div class="issues">${issues.map(i => `<p class="${i.level}">● [${i.code}] ${i.message}</p>`).join('')}</div></section><section class="panel"><h2>Import Review</h2><nav class="tabs"><b>Overview</b><b>Course requirements</b><b>Teacher mappings</b><b>공동수업 설정</b><b>Constraints</b></nav><p>공동수업 후보: ${data.diagnostics.sharedSuggestions?.length ?? 0}, 풀타임 교사: ${data.diagnostics.fullTimeTeacherIds?.map(id => nameOf(id, 'teacher')).join(', ') || '없음'}, 역할 매핑 필요: ${data.diagnostics.teacherRoles?.join(', ') || '없음'}</p></section>${diagnostics()}${teacherMappings()}${sharedPanel()}${feasibilityPanel()}${requirementsPreview()}${ruleReview()}${constraintEditor()}<section class="panel"><h2>시간표 생성</h2>${blocking ? `<p class="error">남은 blocker: ${blockers.map(b => `[${b.code}] ${b.message}`).slice(0, 5).join(' / ')}</p>` : ''}<label>최대 초 <input id="sec" type="number" value="5"></label><label>최대 노드 <input id="nodes" type="number" value="20000"></label><label>Seed <input id="seed" type="number" value="42"></label><p><b>상태:</b> ${solveStatus}</p>${solveError ? `<pre class="error">${solveError}</pre>` : ''}<button id="cancel" ${solveStatus === 'Solving' ? '' : 'disabled'}>Cancel</button><button id="solve" ${data.requirements.length === 0 || blocking || solveStatus === 'Solving' ? 'disabled' : ''}>${solveStatus === 'Solving' ? '시간표 생성 중…' : '시간표 생성'}</button><button id="save">프로젝트 저장</button><button id="xlsx">Excel 내보내기</button><button id="pdf">PDF/인쇄</button></section>` : ''}${result && data ? `<section class="panel"><h2>진행/결과</h2><p>노드 ${result.progress.nodes}, 백트래킹 ${result.progress.backtracks}, 배정 인스턴스 ${result.progress.assigned}/${result.progress.total}, 미배정 인스턴스 ${result.progress.unassigned}, 배정 교시 ${result.progress.assignedPeriods}/${result.progress.totalPeriods}, 미배정 교시 ${result.progress.unassignedPeriods}, 점수 ${result.score}, 종료 ${result.progress.reason}</p><h3>학년별 시간표</h3>${data.grades.map(g => `<details open><summary>${g.name}</summary>${tableFor(a => a.gradeIds.includes(g.id), a => `${nameOf(a.subjectId, 'subject')}<br><small>${a.teacherIds.map(t => nameOf(t, 'teacher')).join(', ')}</small>`)}</details>`).join('')}<h3>교사별 시간표</h3><h3>공동수업</h3>${tableFor(a => a.gradeIds.length > 1, a => `${nameOf(a.subjectId, 'subject')}<br><small>${a.cohortIds.map(c => nameOf(c, 'cohort')).join(', ')}</small>`)}<h3>전체 수업</h3>${tableFor(() => true, a => `${nameOf(a.subjectId, 'subject')}<br><small>${a.teacherIds.map(t => nameOf(t, 'teacher')).join(', ') || '교사 없음/온라인'}</small>`)}<h3>검증 결과</h3>${combineIssues(result.issues, validateResult(data, result)).map(i => `<p class="${i.level}">${i.message}</p>`).join('')}${audit ? `<h3>규칙 감사</h3><p class="${audit.summary.hardFailed ? 'error' : ''}">Hard rules: ${audit.summary.hardPassed}/${audit.summary.hardTotal} passed, ${audit.summary.hardFailed} failed, ${audit.summary.hardIncomplete} incomplete; Soft preferences: ${audit.summary.softSatisfied}/${audit.summary.softTotal} satisfied; Teacher conflicts: ${audit.summary.teacherConflicts}; Participant conflicts: ${audit.summary.participantConflicts}</p><table><thead><tr><th>유형</th><th>원본</th><th>대상</th><th>예상</th><th>실제</th><th>결과</th><th>설명</th></tr></thead><tbody>${audit.items.map(i => `<tr class="${!i.passed && i.category === 'hard' ? 'error' : ''}"><td>${i.ruleType}</td><td>${i.originalText}</td><td>${i.target}</td><td>${i.expected}</td><td>${i.actual}</td><td>${i.status}</td><td>${i.message}</td></tr>`).join('')}</tbody></table>` : ''}<h3>통계</h3><p>배정 교시 ${result.assignments.reduce((a, b) => a + b.length, 0)}, 미배정 교시 ${result.unassigned.reduce((a, b) => a + b.length, 0)}</p><h3>교사별 시간표</h3>${data.teachers.map(t => `<details><summary>${t.name}</summary>${tableFor(a => a.teacherIds.includes(t.id), a => `${nameOf(a.subjectId, 'subject')}<br><small>${a.cohortIds.map(c => nameOf(c, 'cohort')).join(', ')}</small>`)}</details>`).join('')}<h3>미배정/진단</h3>${result.issues.map(i => `<p class="error">${i.message}</p>`).join('')}</section>` : ''}</main>`; bind(); }
function bind() { document.querySelector('#file')?.addEventListener('change', async (e) => { const f = e.target.files?.[0]; if (!f)
    return; try {
    data = normalizeWorkbook(await parseWorkbookFile(f));
    result = null;
    audit = null;
    solveError = '';
    solveStatus = 'Ready';
    render();
}
catch (err) {
    alert(err instanceof Error ? err.message : String(err));
} }); document.querySelectorAll('.map-home').forEach(el => el.addEventListener('change', () => { if (!data)
    return; data.roleMappings ??= { homeroomByGrade: {}, studentCouncil: null }; data.roleMappings.homeroomByGrade[el.dataset.grade] = el.value; data.requirements.forEach(r => { if (r.teacherRule?.type === 'role' && r.teacherRule.roleId === 'homeroom')
    r.status = 'ready'; }); render(); })); document.querySelector('#map-council')?.addEventListener('change', e => { if (!data)
    return; data.roleMappings ??= { homeroomByGrade: {}, studentCouncil: null }; data.roleMappings.studentCouncil = e.target.value || null; data.requirements.forEach(r => { if (r.teacherRule?.type === 'role' && r.teacherRule.roleId === 'student-council')
    r.status = 'ready'; }); render(); }); document.querySelector('#solve')?.addEventListener('click', () => { if (!data || data.requirements.length === 0)
    return; const maxSeconds = Number(document.querySelector('#sec').value), maxNodes = Number(document.querySelector('#nodes').value), seed = Number(document.querySelector('#seed').value); solveStatus = 'Solving'; solveError = ''; result = null; latestSnapshot = null; audit = null; render(); const jobId = String(Date.now()); activeWorker = new Worker(new URL('./scheduler/worker.js', import.meta.url), { type: 'module' }); activeWorker.onmessage = (ev) => { const msg = ev.data; if (msg.type === 'progress') {
    solveStatus = 'Solving';
    if (msg.snapshot) {
        latestSnapshot = msg.snapshot;
        result = msg.snapshot;
    }
    render();
} if (msg.type === 'error') {
    solveStatus = 'Failed';
    solveError = msg.error;
    activeWorker?.terminate();
    activeWorker = null;
    render();
} if (msg.type === 'result') {
    result = msg.result;
    audit = data && result ? auditSchedule(data, result) : null;
    if (result.progress.reason === 'infeasible-hard-constraints')
        solveStatus = 'Hard constraints infeasible';
    else if (audit?.summary.hardFailed || audit?.summary.hardIncomplete)
        solveStatus = 'Failed';
    else if (result.progress.reason === 'time-limit')
        solveStatus = 'Time limit reached';
    else if (result.progress.reason === 'node-limit')
        solveStatus = 'Node limit reached';
    else if (result.unassigned.length)
        solveStatus = 'Partial result';
    else
        solveStatus = 'Complete';
    activeWorker?.terminate();
    activeWorker = null;
    render();
} }; activeWorker.postMessage({ jobId, data, options: { maxSeconds, maxNodes, seed, allowUnassigned: true, weights: { unassigned: 10000 } } }); }); document.querySelector('#save')?.addEventListener('click', () => data && saveProject(data, result ?? undefined)); document.querySelector('#load')?.addEventListener('click', () => { const p = loadProject(); if (p) {
    data = p.data;
    result = p.result ?? null;
    render();
} }); document.querySelector('#xlsx')?.addEventListener('click', () => data && result && exportExcel(data, result)); document.querySelector('#pdf')?.addEventListener('click', printPdf); const add = (type) => { if (!data)
    return; const id = document.querySelector('#cr')?.value; if (!id)
    return; const day = document.querySelector('#day').value; const period = Number(document.querySelector('#period').value); const slot = `${day}-${period}`; const value = type === 'fixed-slot' ? { day, startPeriod: period, endPeriod: period } : type === 'after-school-only' ? { periods: [8] } : { slots: [slot] }; data.constraints.push({ id: `con_${Date.now()}`, type: type === 'after-school-only' ? 'period-only' : type, targetRequirementIds: [id], value, hard: true, source: 'manual' }); const r = data.requirements.find(x => x.id === id); if (r) {
    if (type === 'fixed-slot')
        r.fixedSlots = [slot];
    if (type === 'allowed-slots')
        r.allowedSlots.push(slot);
    if (type === 'forbidden-slots')
        r.forbiddenSlots.push(slot);
    if (type === 'after-school-only') {
        r.afterSchool = true;
        r.allowedSlots = DAYS.map(d => `${d}-8`);
    }
} render(); }; document.querySelector('#fix')?.addEventListener('click', () => add('fixed-slot')); document.querySelector('#after')?.addEventListener('click', () => add('after-school-only')); document.querySelector('#allow')?.addEventListener('click', () => add('allowed-slots')); document.querySelector('#forbid')?.addEventListener('click', () => add('forbidden-slots')); document.querySelector('#cancel')?.addEventListener('click', () => { activeWorker?.terminate(); activeWorker = null; if (latestSnapshot) {
    result = { ...latestSnapshot, progress: { ...latestSnapshot.progress, reason: 'cancelled' } };
    audit = data && result ? auditSchedule(data, result) : null;
    solveStatus = 'Partial result';
}
else {
    solveStatus = 'Failed';
    solveError = 'Cancelled before a candidate schedule was found';
} render(); }); document.querySelectorAll('.merge-suggestion').forEach(b => b.addEventListener('click', () => { if (!data)
    return; const ids = b.dataset.ids.split(',').filter(Boolean); const cohortIds = b.dataset.cohorts.split(',').filter(Boolean); const errs = validateOperation(data, { type: 'merge-shared-class', requirementIds: ids, cohortIds }); if (errs.length)
    return alert(errs.map(e => e.message).join('\n')); data = applyOperation(data, { type: 'merge-shared-class', requirementIds: ids, cohortIds }); render(); })); document.querySelector('#merge-shared')?.addEventListener('click', () => { if (!data)
    return; const ids = [...document.querySelectorAll('.share-pick:checked')].map(x => x.value); if (ids.length < 2)
    return alert('두 개 이상 선택하세요.'); if (!confirm(`Merge ${ids.join(', ')}?`))
    return; data = applyOperation(data, { type: 'merge-shared-class', requirementIds: ids, cohortIds: [...new Set(ids.flatMap(id => data.requirements.find(r => r.id === id)?.cohortIds ?? []))] }); render(); }); document.querySelector('#apply-safe')?.addEventListener('click', () => { if (!data)
    return; const safe = (data.diagnostics.sharedSuggestions ?? []).filter(s => validateOperation(data, { type: 'merge-shared-class', requirementIds: s.requirementIds, cohortIds: s.cohortIds }).length === 0); if (!safe.length)
    return alert('Safe suggestion 없음'); if (!confirm(safe.map(s => s.requirementIds.join(' + ')).join('\n')))
    return; for (const su of safe)
    data = applyOperation(data, { type: 'merge-shared-class', requirementIds: su.requirementIds, cohortIds: su.cohortIds }); render(); }); document.querySelectorAll('.split-shared').forEach(b => b.addEventListener('click', () => { if (data) {
    data = applyOperation(data, { type: 'split-shared-class', sharedRequirementId: b.dataset.id });
    render();
} })); }
render();
