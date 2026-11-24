import { CompactionMessage, CompactionOptions } from './types.js';

/**
 * Self-healing context-overflow recovery:
 * When an LLM rejects a prompt due to context window saturation,
 * this function automatically trims the conversation history
 * while preserving the essential system instructions and the most recent user context.
 */
export function compactMessages(
  messages: CompactionMessage[],
  options: CompactionOptions = {}
): CompactionMessage[] {
  if (!Array.isArray(messages) || messages.length <= 2) {
    return messages;
  }

  const preserveSystem = options.preserveSystemPrompt ?? true;
  const preserveLastN = options.preserveLastNMessages ?? 2;
  const reductionRatio = options.targetReductionRatio ?? 0.35;
  const pinPrefix = options.pinPrefixMessages ?? 0;

  const prefix: CompactionMessage[] = [];
  let workingList = [...messages];

  while (workingList.length && ((preserveSystem && workingList[0]?.role === 'system') || prefix.length < pinPrefix)) prefix.push(workingList.shift()!);

  if (workingList.length <= preserveLastN) {
    return [...prefix, ...workingList];
  }

  // Keep latest N messages
  const recentMessages = workingList.splice(workingList.length - preserveLastN, preserveLastN);

  // Target count of intermediate messages to retain
  const toRetainCount = Math.max(1, Math.floor(workingList.length * (1 - reductionRatio)));
  const units: CompactionMessage[][] = [];
  for (let i = 0; i < workingList.length;) {
    const current = workingList[i];
    const unit = [current];
    const toolCallIds = Array.isArray((current as any).tool_calls) ? (current as any).tool_calls.map((x: any) => x.id).filter(Boolean) : [];
    if (current.role === 'assistant' && toolCallIds.length) {
      while (i + unit.length < workingList.length && workingList[i + unit.length].role === 'tool' && toolCallIds.includes((workingList[i + unit.length] as any).tool_call_id)) unit.push(workingList[i + unit.length]);
    } else if (current.role === 'assistant' && Array.isArray((current as any).content)) {
      const ids = (current as any).content.filter((x: any) => x?.type === 'tool_use').map((x: any) => x.id);
      if (ids.length && workingList[i + 1]?.role === 'user' && Array.isArray((workingList[i + 1] as any).content) && (workingList[i + 1] as any).content.some((x: any) => x?.type === 'tool_result' && ids.includes(x.tool_use_id))) unit.push(workingList[i + 1]);
    }
    units.push(unit); i += unit.length;
  }
  const toRetainUnits = Math.max(1, Math.floor(units.length * (1 - reductionRatio)));
  const compactedMiddle = units.slice(units.length - toRetainUnits).flat();

  const result: CompactionMessage[] = [];
  result.push(...prefix);
  result.push(...compactedMiddle);
  result.push(...recentMessages);

  return result;
}
