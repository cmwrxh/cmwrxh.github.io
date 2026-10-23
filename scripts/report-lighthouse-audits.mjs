import { readFile } from 'node:fs/promises';

for (const file of ['artifacts/lighthouse/mobile.json', 'artifacts/lighthouse/desktop.json']) {
  const report = JSON.parse(await readFile(file, 'utf8'));
  console.log('\n' + file + ' — category scores');
  for (const category of ['performance', 'accessibility', 'best-practices', 'seo']) {
    console.log(`  ${category}: ${Math.round((report.categories[category]?.score ?? 0) * 100)}`);
  }
  for (const id of ['color-contrast', 'link-in-text-block', 'identical-links-same-purpose']) {
    const audit = report.audits[id];
    if (!audit || audit.score === 1 || !audit.details?.items?.length) continue;
    console.log(`\n  ${id}: ${audit.title} — ${audit.details.items.length} item(s)`);
    for (const item of audit.details.items) {
      const node = item.node || item;
      console.log(`    selector: ${node.selector || '(see Lighthouse report)'}`);
      if (node.snippet) console.log(`    element: ${node.snippet}`);
      if (node.explanation) console.log(`    detail: ${node.explanation}`);
    }
  }
}
