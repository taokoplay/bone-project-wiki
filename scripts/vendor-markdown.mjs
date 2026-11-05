// Refresh the checked-in offline lexer from an already-provisioned marked package.
// Usage: node scripts/vendor-markdown.mjs /path/to/marked
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = process.argv[2];
if (!source) throw new Error('Pass the directory of an existing marked 16.4.2 package.');
const metadata = JSON.parse(await readFile(resolve(source, 'package.json'), 'utf8'));
if (metadata.name !== 'marked' || metadata.version !== '16.4.2') throw new Error('Expected marked 16.4.2.');
const runtime = await readFile(resolve(source, 'lib/marked.esm.js'));
const license = await readFile(resolve(source, 'LICENSE.md'), 'utf8');
const root = fileURLToPath(new URL('../', import.meta.url));
await writeFile(resolve(root, 'renderer/marked.mjs'), runtime);
await writeFile(resolve(root, 'THIRD_PARTY_LICENSES.md'), '# Third-party software\n\nThe offline Markdown lexer is Marked 16.4.2, from https://github.com/markedjs/marked.\n`renderer/marked.mjs` is the unmodified `lib/marked.esm.js` distribution.\n\n' + license);
console.log('Vendored marked 16.4.2 SHA-256:', createHash('sha256').update(runtime).digest('hex'));
