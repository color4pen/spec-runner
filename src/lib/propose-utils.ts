// Propose utilities — no 'use server' directive.
// Pure utility functions for propose workflow. Can be imported from both
// server and client contexts.

export const VALID_ENABLED_OPTIONS = [
  'test-case-generator',
  'adr',
  'module-architect',
  'security-reviewer',
  'pattern-reviewer',
] as const;

export type EnabledOption = (typeof VALID_ENABLED_OPTIONS)[number];

// Type prefix mapping for branch name generation
const TYPE_PREFIX_MAP: Record<string, string> = {
  'new-feature': 'feat',
  'spec-change': 'change',
  'refactoring': 'refactor',
  'bugfix': 'fix',
};

/**
 * Generate a slug from a date and title.
 * Format: YYYY-MM-DD-{kebab-case-title}
 */
export function generateSlug(date: string, title: string): string {
  const kebab = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${date}-${kebab}`;
}

/**
 * Generate a branch name from request type and slug.
 * Format: {prefix}/{slug}
 */
export function generateBranchName(type: string, slug: string): string {
  const prefix = TYPE_PREFIX_MAP[type] ?? 'feat';
  return `${prefix}/${slug}`;
}

/**
 * Build the propose instruction message for the managed agent.
 * Includes branch name, request content, and enabled options.
 */
export function buildProposeMessage(params: {
  branchName: string;
  slug: string;
  requestTitle: string;
  requestContent: string | null;
  requestType: string;
  enabled: string[];
}): string {
  const { branchName, slug, requestTitle, requestContent, requestType, enabled } = params;

  const enabledSection =
    enabled.length > 0
      ? `\n\n## Enabled Workflow Options\n${enabled.map((opt) => `- ${opt}`).join('\n')}`
      : '';

  return `You are tasked with running the openspec-propose workflow for this repository.

## Branch Setup

Create and checkout a new branch named \`${branchName}\` from the default branch:
\`\`\`
git checkout -b ${branchName}
\`\`\`

## Request Details

**Slug**: ${slug}
**Type**: ${requestType}
**Title**: ${requestTitle}

**Content**:
<user-request>
${requestContent ?? '(no content provided)'}
</user-request>${enabledSection}

## Your Task

Follow the openspec-propose workflow to generate the change folder at \`openspec/changes/${slug}/\` containing:
- \`proposal.md\` — what and why
- \`design.md\` — technical design decisions
- \`tasks.md\` — implementation task list
- Any relevant spec files under \`specs/\`

Also create the request file at \`requests/active/${slug}/request.md\` with the pipeline-context.md.

In the pipeline-context.md, include the following enabled options:
\`\`\`
enabled: [${enabled.join(', ')}]
\`\`\`

After generating all files, commit and push to the branch:
\`\`\`
git add -A
git commit -m "propose: ${slug}"
git push origin ${branchName}
\`\`\`

Do not create a pull request — the application will handle that separately.
Do not ask for confirmation — proceed autonomously through all steps.`;
}

/**
 * Parse the enabled JSON string from DB into a string array.
 * Returns empty array on parse failure (safe fallback).
 */
export function parseEnabledJson(enabledJson: string | null): string[] {
  if (!enabledJson) return [];
  try {
    const parsed = JSON.parse(enabledJson) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return [];
  }
}
