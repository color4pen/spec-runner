// register_branch Custom Tool definition.
// Shared constant importable from both custom-tool-handler.ts and session creation code.
// No 'use server' — pure utility module.

import type { BetaManagedAgentsCustomToolParams } from '@anthropic-ai/sdk/resources/beta/agents/agents';

export const REGISTER_BRANCH_TOOL: BetaManagedAgentsCustomToolParams = {
  type: 'custom',
  name: 'register_branch',
  description:
    'Registers the branch name and slug with spec-runner after branch creation. ' +
    'Must be called exactly once after `git checkout -b` to report the slug and branch_name so spec-runner can track the proposal.',
  input_schema: {
    type: 'object',
    properties: {
      slug: {
        type: 'string',
        description:
          'The kebab-case slug used for the change folder (e.g. "2026-04-25-modernize-ui"). ' +
          'Format: YYYY-MM-DD- prefix followed by lowercase alphanumeric words separated by hyphens. Maximum 60 characters.',
      },
      branch_name: {
        type: 'string',
        description:
          'The full branch name as created by git checkout -b (e.g. "feat/2026-04-25-modernize-ui").',
      },
      request_id: {
        type: 'integer',
        description: 'The database ID of the request this branch belongs to.',
      },
    },
    required: ['slug', 'branch_name', 'request_id'],
  },
};
