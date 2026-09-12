import type { AgentProfile } from '../../src/core/types.js';

export default {
  id: 'claude-code-deepseek-flash-medium',
  adapter: 'claude-code',
  model: 'deepseek-flash',
  reasoningEffort: 'medium',
} satisfies AgentProfile;
