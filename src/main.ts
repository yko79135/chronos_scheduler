import './styles.css';
import { importClasses, importConstraints, populatedConstraintTemplate } from './importer.js';
import { GRADES, ImportData } from './model.js';

const SOLVER_DISABLED_MESSAGE = 'Scheduler engine is temporarily disabled while correctness validation is completed.';
const buildVersion = import.meta.env.VITE_GIT_COMMIT || import.meta.env.MODE;
let data: ImportData | null = null;
const app = document.getElementById('app');

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]!);
}

function bootError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : '';
  const target = document.getElementById('app') ?? document.body;
  target.innerHTML = `<section class="boot-error" role="alert"><h1>Chronos Scheduler could not start</h1><p>${escapeHtml(message)}</p><p><small>Build: ${escapeHtml(buildVersion)}</small></p>${import.meta.env.DEV && stack ? `<pre>${escapeHtml(stack)}</pre>` : ''}</section>`;
}

window.addEventListener('error', (event) => bootError(event.error ?? event.message));
window.addEventListener('unhandledrejection', (event) => bootError(event.reason));

const read = (file: File) => file.text();
const stat = (label: string, value: unknown) => `<div class="card"><b>${escapeHtml(label)}</b><strong>${escapeHtml(value)}</strong></div>`;

function render(): void {
  if (!app) throw new Error('Missing #app root element');
  app.innerHTML = `<header><h1>Chronos Scheduler</h1><p>CSV importing is available. Each class CSV row is treated as one atomic class; the scheduling engine is disabled pending correctness validation.</p></header><main><section class="panel"><h2>Import CSVs</h2><label>Class CSV<input id="classes" type="file" accept=".csv,text/csv" /></label><label>Constraint CSV<input id="constraints" type="file" accept=".csv,text/csv" /></label><button id="template" ${data ? '' : 'disabled'}>Download populated constraint template</button><button id="generate" disabled>Generate</button><p class="warn" id="solver-disabled">${SOLVER_DISABLED_MESSAGE}</p></section>${data ? review() : ''}</main>`;
  bind();
}

function review(): string {
  const s = data!.stats;
  const c = data!.constraints;
  return `<section class="panel"><h2>Import Review</h2><div class="grid">${stat('class rows imported', s.classRows)}${stat('subjects', s.subjects)}${stat('canonical grades', s.canonicalGrades)}${stat('named teachers', s.namedTeachers)}${stat('rooms', s.rooms)}${stat('inferred meetings', s.meetings)}${stat('total period units', s.periodUnits)}${stat('consecutive blocks', s.consecutiveBlocks)}${stat('after-school class rows', s.afterSchoolRows)}${stat('after-school meeting periods', s.afterSchoolPeriods)}${stat('active strict constraints', c?.activeStrict ?? 0)}${stat('active availability constraints', c?.activeAvailability ?? 0)}${stat('excluded constraint rows', c?.excluded.length ?? 0)}${stat('validation errors', data!.errors.length)}${stat('warnings', data!.warnings.length + (c?.warnings.length ?? 0))}</div>${c?.warnings.map((w) => `<p class="warn">${escapeHtml(w)}</p>`).join('') ?? ''}<h3>Grade loads</h3><table><tbody>${GRADES.map((g) => `<tr><td>${g}</td><td>${s.gradeLoads[g].regular} regular</td><td>${s.gradeLoads[g].after} period-8</td></tr>`).join('')}</tbody></table><h3>Normalized Classes</h3><table><thead><tr><th>ID</th><th>subject</th><th>original grade expression</th><th>expanded grades</th><th>teacher semantics</th><th>room</th><th>weekly</th><th>generated meeting pattern</th><th>period type</th><th>preference</th></tr></thead><tbody>${data!.classes.map((x) => `<tr><td>${escapeHtml(x.id)}</td><td>${escapeHtml(x.subject)}</td><td>${escapeHtml(x.gradeExpr)}</td><td>${escapeHtml(x.grades.join(', '))}</td><td>${escapeHtml(x.teacher.kind === 'co' ? 'Both teachers are required and will be occupied simultaneously.' : x.teacherCell)}</td><td>${escapeHtml(x.room)}</td><td>${x.weekly}</td><td>${escapeHtml(x.meetings.map((m) => `${m.length} period`).join(' + '))}</td><td>${x.afterSchool ? 'after-school' : 'regular'}</td><td>${x.morning ? 'morning' : x.afternoon ? 'afternoon' : 'none'}</td></tr>`).join('')}</tbody></table></section>`;
}

function bind(): void {
  document.getElementById('classes')?.addEventListener('change', async (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      data = importClasses(await read(file));
      render();
    }
  });
  document.getElementById('constraints')?.addEventListener('change', async (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file && data) {
      data.constraints = importConstraints(await read(file), data.classes);
      render();
    }
  });
  document.getElementById('template')?.addEventListener('click', () => {
    if (data) download('populated_constraints.csv', populatedConstraintTemplate(data.classes), 'text/csv');
  });
}

function download(name: string, content: string, type: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

try {
  render();
} catch (error) {
  bootError(error);
}
