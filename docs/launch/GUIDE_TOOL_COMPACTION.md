# Guide: safe tool-call compaction

Never compact an assistant `tool_calls` message separately from its matching `tool` responses. Use `compactMessages()` from `@rohan9024/retrykit/compaction`, preserve system/pinned prefixes, and run the compaction proof tests before changing the grouping rules.
