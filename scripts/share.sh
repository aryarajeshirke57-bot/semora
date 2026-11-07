#!/usr/bin/env bash
# Builds the teammate hand-off in share/:
#   semora.zip             the repo at HEAD (no secrets, no node_modules), for Claude Code or to run locally
#   semora-for-claude.md   the whole project as ONE file, to drop into any Claude chat or Project
# Usage: npm run share   (commit first; both files are built from HEAD, never from the working tree)
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p share
rm -f share/semora.zip share/semora-for-claude.md

git archive --format=zip --prefix=semora/ -o share/semora.zip HEAD -- . ':(exclude)screenshots'

node --input-type=module - <<'JS'
import { execSync } from 'node:child_process';
import fs from 'node:fs';
const files = execSync('git ls-files', { encoding: 'utf8' }).trim().split('\n')
  .filter((f) => !f.startsWith('screenshots/') && f !== 'package-lock.json' && !f.endsWith('.png'));
const order = ['CLAUDE.md', 'README.md', 'DEMO.md', 'STATUS.md', 'docs/CONTEXT.md', 'docs/DEMO_STORY.md', 'PLAN.md'];
files.sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99) || a.localeCompare(b));
const sha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
const lang = (f) => ({ ts: 'ts', tsx: 'tsx', css: 'css', json: 'json', md: 'markdown', html: 'html', js: 'js', sh: 'bash' })[f.split('.').pop()] ?? '';
let out = `# Semora: the complete project in one file (commit ${sha})

**To Claude:** this file is the entire Semora repository: every source file, test, doc and config, except \`package-lock.json\` and screenshots. A teammate dropped it in so you can work on Semora with full context.
- Start with \`CLAUDE.md\` (project rules and map) and \`DEMO.md\` (the demo path that must keep working).
- When you change code, give **complete replacement files or exact edits with their paths**, so they can be pasted back into the repo.
- To run it: unzip \`semora.zip\` (or clone), then \`npm install && npm run dev\` and open http://localhost:5173. No credentials are needed. \`npm run check\` runs types, lint and tests.

## Files
${files.map((f) => `- ${f}`).join('\n')}

`;
for (const f of files) out += `\n---\n\n## \`${f}\`\n\n\`\`\`\`${lang(f)}\n${fs.readFileSync(f, 'utf8').replace(/\n$/, '')}\n\`\`\`\`\n`;
fs.writeFileSync('share/semora-for-claude.md', out);
console.log(`share/semora-for-claude.md: ${files.length} files, ${(out.length / 1024).toFixed(0)} KB (~${Math.round(out.length / 3.8 / 1000)}k tokens)`);
JS
echo "share/semora.zip: $(du -h share/semora.zip | cut -f1)"
