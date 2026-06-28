const trim = (v) => v.replace(/\s+/g, '').replace(/[()]/g, '').trim();
export function gradeNumber(name) { const m = name.match(/(?:G|Grade)?\s*(\d{1,2})|^(\d{1,2})학년/iu); return m ? Number(m[1] ?? m[2]) : undefined; }
export function parseGradeExpression(input, registered) { const raw = trim(String(input)); if (!raw)
    return []; if (/^(전학년|All)$/i.test(raw))
    return [...registered]; const parts = raw.split(/[,+]/).filter(Boolean); const out = new Set(); for (const part of parts) {
    const r = part.match(/(?:G)?(\d{1,2})\s*-\s*(?:G)?(\d{1,2})(?:학년)?/i);
    if (r) {
        const a = Number(r[1]), b = Number(r[2]);
        registered.forEach(g => { const n = gradeNumber(g); if (n !== undefined && n >= Math.min(a, b) && n <= Math.max(a, b))
            out.add(g); });
        continue;
    }
    const exact = registered.find(g => trim(g).toLowerCase() === part.toLowerCase() || trim(g).replace(/^G/i, '') === part.replace(/학년$/, ''));
    if (exact)
        out.add(exact);
    else {
        const n = gradeNumber(part);
        registered.filter(g => gradeNumber(g) === n).forEach(g => out.add(g));
    }
} return [...out]; }
export function stableId(prefix, name) { return `${prefix}_${name.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '')}`; }
