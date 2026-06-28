import { parseWorkbookFile } from './scheduler/parser.js';
import { normalizeWorkbook } from './scheduler/normalizer.js';
import { solveSchedule } from './scheduler/solver.js';
import { validateData, validateResult } from './scheduler/validator.js';
import { exportExcel, loadProject, printPdf, saveProject } from './scheduler/exporter.js';
import { DAYS } from './scheduler/time.js';
let data = null;
let result = null;
const app = document.querySelector('#app');
const nameOf = (id, kind) => { if (!data)
    return id; const list = kind === 'subject' ? data.subjects : kind === 'teacher' ? data.teachers : data.grades; return list.find(x => x.id === id)?.name ?? id; };
function card(title, value, cls = '') { return `<section class="card ${cls}"><b>${title}</b><strong>${value}</strong></section>`; }
function tableFor(filter, cell) { const rows = [1, 2, 3, 4, 99, 5, 6, 7, 8]; return `<table class="schedule"><thead><tr><th>교시</th><th>시간</th>${DAYS.map(d => `<th>${d}</th>`).join('')}</tr></thead><tbody>${rows.map(p => `<tr class="${p === 99 ? 'lunch' : ''}"><th>${p === 99 ? '점심' : p}</th><td>${p === 99 ? '11:55-13:05' : p === 8 ? '15:20-16:00' : p < 5 ? ['', '09:00-09:40', '09:45-10:25', '10:30-11:10', '11:15-11:55'][p] : ['', '', '', '', '', '13:05-13:45', '13:50-14:30', '14:35-15:15'][p]}</td>${DAYS.map(d => { const a = result?.assignments.find(x => filter(x) && x.slot === `${d}-${p}`); return `<td>${a ? cell(a) : ''}</td>`; }).join('')}</tr>`).join('')}</tbody></table>`; }
function render() { const issues = data ? validateData(data) : []; app.innerHTML = `<header><h1>Chronos Scheduler</h1><p>Excel 기반 교사·학생·학년 시간표 자동 생성 웹앱</p></header><main><section class="panel"><h2>Excel 업로드</h2><div id="drop"><input type="file" id="file" accept=".xlsx"/><p>.xlsx 파일을 드래그하거나 선택하세요. 브라우저에서 직접 읽고 서버에 저장하지 않습니다.</p></div><button id="load">저장 프로젝트 불러오기</button></section>${data ? `<section class="grid">${card('학생 수', data.students.length)}${card('학년 수', data.grades.length)}${card('교사 수', data.teachers.length)}${card('과목 수', data.subjects.length)}${card('전체 주당 교시', data.requirements.reduce((a, b) => a + b.totalPeriodsPerWeek, 0))}${card('수업 인스턴스', data.requirements.reduce((a, b) => a + b.meetingLengths.length, 0))}${card('오류', issues.filter(i => i.level === 'error').length, 'bad')}${card('경고', issues.filter(i => i.level === 'warning').length, 'warn')}</section><section class="panel"><h2>시트 및 검증</h2><p>${data.sourceSheets.join(', ')}</p><div class="issues">${issues.map(i => `<p class="${i.level}">● [${i.code}] ${i.message}</p>`).join('')}</div></section><section class="panel"><h2>시간표 생성</h2><label>최대 초 <input id="sec" type="number" value="5"></label><label>최대 노드 <input id="nodes" type="number" value="20000"></label><label>Seed <input id="seed" type="number" value="42"></label><button id="solve">시간표 생성</button><button id="save">프로젝트 저장</button><button id="xlsx">Excel 내보내기</button><button id="pdf">PDF/인쇄</button></section>` : ''}${result && data ? `<section class="panel"><h2>진행/결과</h2><p>노드 ${result.progress.nodes}, 백트래킹 ${result.progress.backtracks}, 배정 ${result.progress.assigned}/${result.progress.total}, 미배정 ${result.progress.unassigned}, 점수 ${result.score}, 종료 ${result.progress.reason}</p><div class="tabs"><h3>학년별 시간표</h3>${data.grades.slice(0, 6).map(g => `<details open><summary>${g.name}</summary>${tableFor(a => a.gradeIds.includes(g.id), a => `${nameOf(a.subjectId, 'subject')}<br><small>${a.teacherIds.map(t => nameOf(t, 'teacher')).join(', ')}</small>`)}</details>`).join('')}<h3>교사별 시간표</h3>${data.teachers.slice(0, 6).map(t => `<details><summary>${t.name}</summary>${tableFor(a => a.teacherIds.includes(t.id), a => `${nameOf(a.subjectId, 'subject')}<br><small>${a.gradeIds.map(g => nameOf(g, 'grade')).join(', ')}</small>`)}</details>`).join('')}<h3>미배정/진단</h3>${result.issues.map(i => `<p class="error">${i.message}</p>`).join('')}</div></section>` : ''}</main>`; bind(); }
function bind() { document.querySelector('#file')?.addEventListener('change', async (e) => { const f = e.target.files?.[0]; if (!f)
    return; try {
    data = normalizeWorkbook(await parseWorkbookFile(f));
    result = null;
    render();
}
catch (err) {
    alert(err instanceof Error ? err.message : String(err));
} }); document.querySelector('#solve')?.addEventListener('click', () => { if (!data)
    return; result = solveSchedule(data, { maxSeconds: Number(document.querySelector('#sec').value), maxNodes: Number(document.querySelector('#nodes').value), seed: Number(document.querySelector('#seed').value), allowUnassigned: true, weights: { unassigned: 10000 } }); result.issues.push(...validateResult(data, result)); render(); }); document.querySelector('#save')?.addEventListener('click', () => data && saveProject(data, result ?? undefined)); document.querySelector('#load')?.addEventListener('click', () => { const p = loadProject(); if (p) {
    data = p.data;
    result = p.result ?? null;
    render();
} }); document.querySelector('#xlsx')?.addEventListener('click', () => data && result && exportExcel(data, result)); document.querySelector('#pdf')?.addEventListener('click', printPdf); }
render();
