import { describe, expect, test } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('production bundle assets', () => {
  test('dist/index.html references only emitted local assets', () => {
    const indexPath = join(process.cwd(), 'dist', 'index.html');
    expect(existsSync(indexPath)).toBe(true);
    const html = readFileSync(indexPath, 'utf8');
    expect(html).toMatch(/\/assets\/[^"']+\.js/);
    expect(html).toMatch(/\/assets\/[^"']+\.css/);
    expect(html).not.toContain('/src/');
    expect(html).not.toMatch(/<script[^>]+\.ts["']/);
    expect(html).not.toMatch(/from ["'](?![./\/])[^"']+["']/);
    const refs = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((match) => match[1]);
    expect(refs.length).toBeGreaterThanOrEqual(2);
    for (const ref of refs) {
      expect(existsSync(join(process.cwd(), 'dist', ref))).toBe(true);
    }
  });
});
