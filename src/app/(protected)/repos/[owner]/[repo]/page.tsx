import { getOrCreateRepository } from '@/lib/repository-actions';
import { listRequests } from '@/lib/request-actions';
import { listAgents, listEnvironments } from '@/lib/actions';
import { WorkspaceClient } from './_components/workspace-client';

export const dynamic = 'force-dynamic';

export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}) {
  const { owner, repo } = await params;

  const repository = await getOrCreateRepository(owner, repo);

  const [requestsList, agents, environments] = await Promise.all([
    listRequests(repository.id).catch(() => []),
    listAgents().catch(() => []),
    listEnvironments().catch(() => []),
  ]);

  return (
    <WorkspaceClient
      owner={owner}
      repo={repo}
      repositoryId={repository.id}
      initialRequests={requestsList}
      agents={agents}
      environments={environments}
    />
  );
}
