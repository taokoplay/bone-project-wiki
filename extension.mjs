import policy from './memory-policy.cjs';
import { readProjectContextStats, saveAutomaticMemories, memoryReferencesPresent } from './memory-context.mjs';
import { writeRecallTrace } from './recall-trace-storage.mjs';

export { readProjectContext, readProjectContextStats, saveAutomaticMemories } from './memory-context.mjs';
export const { extractAutomaticMemoryCandidates, memoryRequest, usableMemory } = policy;
const { CONTEXT_MEMORY_GUIDANCE } = policy;
const traceErrorCode = error => /^[A-Z][A-Z0-9_]{0,63}$/.test(error?.code || error?.message || '') ? error.code || error.message : 'TRACE_WRITE_FAILED';

export default function boneProjectWiki(pi) {
  const pendingMemories = new Map(), preparations = new Map();
  const keyFor = ctx => JSON.stringify([ctx.cwd,ctx.sessionManager?.getSessionId?.() || '']);
  pi.on('before_agent_start',async(event,ctx)=>{
    const key = keyFor(ctx), ticket = Symbol('preparation');
    pendingMemories.delete(key); preparations.set(key,ticket);
    const current = () => preparations.get(key) === ticket && keyFor(ctx) === key && !ctx.signal?.aborted;
    try {
      if (!current()) return;
      const request = memoryRequest(event.prompt);
      const candidates = extractAutomaticMemoryCandidates([{role:'user',content:event.prompt}]);
      if (candidates.length) pendingMemories.set(key,candidates);
      let result;
      try { result = await readProjectContextStats(ctx.cwd,{query:event.prompt,explain:true}); }
      catch (error) { if (current()) ctx.ui?.notify?.(`BoneProjectWiki: automatic memory was not loaded (${error.code || error.message}).`,'warning'); }
      if (!current()) return;
      if (result?.text && result.explanation) {
        try { await writeRecallTrace(ctx.cwd,result.explanation,{sessionId:key,signal:ctx.signal,isCurrent:current,
          validateReferences:()=>memoryReferencesPresent(ctx.cwd,result.references)}); }
        catch (error) {
          if (error.message === 'STALE_RECALL_REFERENCES') result = null;
          else if (current()) ctx.ui?.notify?.(`BoneProjectWiki: recall preparation diagnostics were not saved (${traceErrorCode(error)}).`,'warning');
        }
      }
      if (!current()) return;
      const additions = [result?.text,request.needsContext ? CONTEXT_MEMORY_GUIDANCE : ''].filter(Boolean);
      if (additions.length) return {systemPrompt:[event.systemPrompt,...additions].join('\n\n')};
    } finally {
      if (preparations.get(key) === ticket) {
        if (!current()) pendingMemories.delete(key);
        preparations.delete(key);
      }
    }
  });
  pi.on('agent_settled',async(_event,ctx)=>{
    const key = keyFor(ctx), candidates = pendingMemories.get(key) || [];
    pendingMemories.delete(key);
    if (ctx.signal?.aborted || !candidates.length) return;
    try { await saveAutomaticMemories(ctx.cwd,candidates,ctx.signal); }
    catch (error) {
      if (!ctx.signal?.aborted) ctx.ui?.notify?.(`BoneProjectWiki: automatic memory was not saved (${error.code || error.message}).`,'warning');
    }
  });
  pi.on('session_shutdown',(_event,ctx)=>{pendingMemories.delete(keyFor(ctx));preparations.delete(keyFor(ctx));});
  const discardFailedTurn = (event,ctx) => {
    const message = event.message || (Array.isArray(event.messages) ? event.messages.findLast(item=>item?.role==='assistant') : null);
    if (message?.role==='assistant'&&['aborted','error'].includes(message.stopReason)) {
      pendingMemories.delete(keyFor(ctx)); preparations.delete(keyFor(ctx));
    }
  };
  pi.on('message_end',discardFailedTurn);
  pi.on('agent_end',discardFailedTurn);
}
