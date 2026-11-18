import { describe, it, expect } from 'vitest';
import { compactMessages } from '../src/compaction.js';

describe('compactMessages', () => {
  it('retains system message and latest user prompt while reducing middle history', () => {
    const messages = [
      { role: 'system', content: 'Act as coding assistant' },
      { role: 'user', content: 'Turn 1' },
      { role: 'assistant', content: 'Turn 1 reply' },
      { role: 'user', content: 'Turn 2' },
      { role: 'assistant', content: 'Turn 2 reply' },
      { role: 'user', content: 'Latest Query' },
    ];

    const compacted = compactMessages(messages, {
      preserveSystemPrompt: true,
      preserveLastNMessages: 1,
      targetReductionRatio: 0.5,
    });

    expect(compacted[0].role).toBe('system');
    expect(compacted[compacted.length - 1].content).toBe('Latest Query');
    expect(compacted.length).toBeLessThan(messages.length);
  });
});