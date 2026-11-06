import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import core from './core.cjs';

const { ROOT, relative } = core;
export const sameFile = (a, b) => a.ino === b.ino && a.dev === b.dev;
export const missing = error => error?.code === 'ENOENT';

export async function safeDirectory(base, name) {
  relative(name);
  if (name !== ROOT && !name.startsWith(`${ROOT}/`)) throw new Error('UNSAFE_CONTEXT_PATH');
  let info;
  const parts = name.split('/');
  for (let i = 1; i <= parts.length; i += 1) {
    info = await fs.lstat(path.join(base, ...parts.slice(0, i)));
    if (info.isSymbolicLink() || !info.isDirectory()) throw new Error(i === 1 ? 'UNSAFE_WIKI_ROOT' : 'UNSAFE_CONTEXT_DIRECTORY');
  }
  return info;
}

export async function readSafe(base, name, limit) {
  relative(name);
  const parent = path.posix.dirname(name);
  const directoryInfo = await safeDirectory(base, parent);
  const filename = path.join(base, name);
  const info = await fs.lstat(filename);
  if (info.isSymbolicLink() || !info.isFile() || info.size > limit) throw new Error('UNSAFE_CONTEXT_FILE');
  const handle = await fs.open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const actual = await handle.stat();
    if (!actual.isFile() || !sameFile(actual, info) || actual.size > limit) throw new Error('CONTEXT_CHANGED');
    const buffer = Buffer.alloc(limit + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead > limit) throw new Error('CONTEXT_FILE_LIMIT');
    const after = await handle.stat();
    if (bytesRead !== actual.size || !sameFile(after, actual) || after.size !== actual.size || after.mtimeMs !== actual.mtimeMs
      || !sameFile(directoryInfo, await safeDirectory(base, parent))) throw new Error('CONTEXT_CHANGED');
    return buffer.subarray(0, bytesRead).toString('utf8');
  } finally { await handle.close(); }
}
