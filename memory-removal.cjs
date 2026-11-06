'use strict';
const { purgeTraceReferences } = require('./recall-traces.cjs');
const { memoryKey } = require('./memory-diagnostics.cjs');

async function forgetMemory(service, input) {
  const selector = {...input,section:'memory'};
  const entry = await service.read(selector);
  if (entry.kind !== 'memory') throw new Error('ONLY_MEMORY_CAN_BE_FORGOTTEN');
  if (entry.revision !== input.expectedRevision) throw new Error('REVISION_CONFLICT');
  const key = memoryKey(entry);
  await purgeTraceReferences(service.pi,input.workspacePath,key);
  const latest = await service.read(selector);
  if (latest.revision !== entry.revision || latest.path !== entry.path) throw new Error('REVISION_CONFLICT');
  await service.workspace(input.workspacePath);
  await service.pi.fs.remove(entry.path);
  if (await service.exists(entry.path,input.workspacePath) !== null) throw new Error(`DELETE_VERIFY_FAILED: ${entry.path} is still present`);
  // Catch preparations published between the first purge and the deletion.
  // Later publications verify their references and clean their owned trace.
  await purgeTraceReferences(service.pi,input.workspacePath,key);
  await service.forgetIndexRow('memory',input.workspacePath,entry.path);
  return {deleted:true};
}
module.exports = { forgetMemory };
