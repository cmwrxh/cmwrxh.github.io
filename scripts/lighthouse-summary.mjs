import fs from 'node:fs';
import path from 'node:path';
const dir = 'artifacts/site-shell/lighthouse';
if (!fs.existsSync(dir)) { console.error('Lighthouse output directory is missing'); process.exit(1); }
const files = fs.readdirSync(dir).filter((name) => name.endsWith('.json')).sort();
const score = (report, key) => { const value = report.categories?.[key]?.score; return typeof value === 'number' ? Math.round(value * 100) : 'n/a'; };
const rows = ['| Page | Performance | Accessibility | Best Practices | SEO |','|---|---:|---:|---:|---:|'];
for (const file of files) {
  const report = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  rows.push('| ' + file.replace(/-desktop\.json$/, '') + ' | ' + score(report, 'performance') + ' | ' + score(report, 'accessibility') + ' | ' + score(report, 'best-practices') + ' | ' + score(report, 'seo') + ' |');
}
fs.writeFileSync('artifacts/site-shell/lighthouse-scores.md', rows.join('\n') + '\n');
console.log(rows.join('\n'));
