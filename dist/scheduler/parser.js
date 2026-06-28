export async function parseWorkbookFile(file) { const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellStyles: true, cellDates: false }); const sheets = {}, merges = {}, warnings = []; for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' }).map(r => r.map(v => ({ v: typeof v === 'string' ? v.trim() : v })));
    sheets[name] = rows;
    merges[name] = (ws['!merges'] ?? []).map(m => `${m.s.r + 1}:${m.s.c + 1}-${m.e.r + 1}:${m.e.c + 1}`);
    if (rows.some(row => row.some(c => typeof c.v === 'string' && c.v !== c.v.trim())))
        warnings.push({ level: 'warning', code: 'trim', message: `${name} 시트에 앞뒤 공백이 있어 정리했습니다.` });
} return { sheets, sheetNames: wb.SheetNames, warnings, merges }; }
export function cellText(row, i) { return String(row?.[i]?.v ?? '').replace(/\s+/g, ' ').trim(); }
export function num(v) { const m = String(v).match(/[\d.]+/); return m ? Number(m[0]) : 0; }
