/**
 * Zero-touch registration: Auto-patches native fetch for AI domains on import.
 * Usage: import '@rohan9024/retrykit/register';
 */
import { patchGlobalFetch } from './patch.js';

patchGlobalFetch();