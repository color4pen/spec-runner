import { listUserSessions } from '@/lib/session-actions';
import { listAgents, listEnvironments } from '@/lib/actions';
import { WorkspaceClient } from './_components/workspace-client';

export const dynamic = 'force-dynamic';

export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}) {
  const { owner, repo } = await params;
  const repoFullName = `${owner}/${repo}`;

  const [sessions, agents, environments] = await Promise.all([
    listUserSessions(repoFullName).catch(() => []),
    listAgents().catch(() => []),
    listEnvironments().catch(() => []),
  ]);

  return (
    <WorkspaceClient
      owner={owner}
      repo={repo}
      initialSessions={sessions}
      agents={agents}
      environments={environments}
    />
  );
}
