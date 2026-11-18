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

  let systemPrompt: CompactionMessage | undefined;
  let workingList = [...messages];

  if (preserveSystem && workingList[0]?.role === 'system') {
    systemPrompt = workingList.shift();
  }

  if (workingList.length <= preserveLastN) {
    return systemPrompt ? [systemPrompt, ...workingList] : workingList;
  }

  // Keep latest N messages
  const recentMessages = workingList.splice(workingList.length - preserveLastN, preserveLastN);

  // Target count of intermediate messages to retain
  const toRetainCount = Math.max(1, Math.floor(workingList.length * (1 - reductionRatio)));
  const compactedMiddle = workingList.slice(workingList.length - toRetainCount);

  const result: CompactionMessage[] = [];
  if (systemPrompt) result.push(systemPrompt);
  result.push(...compactedMiddle);
  result.push(...recentMessages);

  return result;
}