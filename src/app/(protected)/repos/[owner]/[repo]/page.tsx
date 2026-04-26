import { getDb } from '@/lib/db';
import { repositories } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { listRequests } from '@/lib/request-actions';
import { listAgents, listEnvironments } from '@/lib/actions';
import { WorkspaceClient } from './_components/workspace-client';
import { getAuthenticatedUser } from '@/lib/auth-helpers';
import { syncBootstrapPrStatus } from '@/lib/bootstrap-actions';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}) {
  const { owner, repo } = await params;

  const user = await getAuthenticatedUser();
  const db = getDb();
  const fullName = `${owner}/${repo}`;

  const [repository] = await db
    .select()
    .from(repositories)
    .where(
      and(
        eq(repositories.fullName, fullName),
        eq(repositories.userId, user.dbId)
      )
    );

  if (!repository) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
          <h2 className="text-lg font-semibold text-yellow-800 mb-2">
            Repository not registered
          </h2>
          <p className="text-yellow-700 text-sm">
            <strong>{fullName}</strong> is not registered in SpecRunner.
            Please go to the{' '}
            <Link href="/repos" className="underline hover:text-yellow-900">
              Repositories page
            </Link>{' '}
            and add this repository first.
          </p>
        </div>
      </div>
    );
  }

  // Auto-sync PR status when pr_pending
  let currentRepository = repository;
  if (repository.bootstrapStatus === 'pr_pending') {
    try {
      const synced = await syncBootstrapPrStatus(repository.id);
      currentRepository = {
        ...repository,
        bootstrapStatus: synced.bootstrapStatus,
        bootstrapPrUrl: synced.bootstrapPrUrl,
      };
    } catch {
      // Retain current status on API error
    }
  }

  const [requestsList, agents, environments] = await Promise.all([
    listRequests(currentRepository.id).catch(() => []),
    listAgents().catch(() => []),
    listEnvironments().catch(() => []),
  ]);

  return (
    <WorkspaceClient
      owner={owner}
      repo={repo}
      repositoryId={currentRepository.id}
      defaultBranch={currentRepository.defaultBranch ?? null}
      bootstrapStatus={currentRepository.bootstrapStatus}
      bootstrapPrUrl={currentRepository.bootstrapPrUrl}
      initialRequests={requestsList}
      agents={agents}
      environments={environments}
    />
  );
}
