import policy from './memory-policy.cjs';
import { readProjectContext, saveAutomaticMemories } from './memory-context.mjs';

export { readProjectContext, readProjectContextStats, saveAutomaticMemories } from './memory-context.mjs';
export const { extractAutomaticMemoryCandidates, memoryRequest, usableMemory } = policy;
const { CONTEXT_MEMORY_GUIDANCE } = policy;

export default function boneProjectWiki(pi) {
  const pendingMemories = new Map();
  const keyFor = ctx => JSON.stringify([ctx.cwd, ctx.sessionManager?.getSessionId?.() || '']);
  pi.on('before_agent_start', async (event, ctx) => {
    const key = keyFor(ctx);
    pendingMemories.delete(key);
    if (ctx.signal?.aborted) return;
    const request = memoryRequest(event.prompt);
    const candidates = extractAutomaticMemoryCandidates([{ role: 'user', content: event.prompt }]);
    if (candidates.length) pendingMemories.set(key, candidates);
    let context;
    try { context = await readProjectContext(ctx.cwd, { query: event.prompt }); }
    catch (error) { ctx.ui?.notify?.(`BoneProjectWiki: automatic memory was not loaded (${error.code || error.message}).`, 'warning'); }
    const additions = [context, request.needsContext ? CONTEXT_MEMORY_GUIDANCE : ''].filter(Boolean);
    if (additions.length) return { systemPrompt: [event.systemPrompt, ...additions].join('\n\n') };
  });
  pi.on('agent_settled', async (_event, ctx) => {
    const key = keyFor(ctx);
    const candidates = pendingMemories.get(key) || [];
    pendingMemories.delete(key);
    if (ctx.signal?.aborted || !candidates.length) return;
    try { await saveAutomaticMemories(ctx.cwd, candidates, ctx.signal); }
    catch (error) {
      if (!ctx.signal?.aborted) ctx.ui?.notify?.(`BoneProjectWiki: automatic memory was not saved (${error.code || error.message}).`, 'warning');
    }
  });
  pi.on('session_shutdown', (_event, ctx) => { pendingMemories.delete(keyFor(ctx)); });
  const discardFailedTurn = (event, ctx) => {
    const message = event.message || (Array.isArray(event.messages) ? event.messages.findLast(item => item?.role === 'assistant') : null);
    if (message?.role === 'assistant' && ['aborted', 'error'].includes(message.stopReason)) pendingMemories.delete(keyFor(ctx));
  };
  pi.on('message_end', discardFailedTurn);
  pi.on('agent_end', discardFailedTurn);
}
