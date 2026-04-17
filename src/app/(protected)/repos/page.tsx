import { listUserRepositories, type RepositoryWithStatus } from '@/lib/repository-registration-actions';
import { ReposPageClient } from './_components/repos-page-client';

export const dynamic = 'force-dynamic';

export default async function ReposPage() {
  let repos: RepositoryWithStatus[] = [];
  let error: string | null = null;

  try {
    repos = await listUserRepositories({ limit: 50, offset: 0 });
  } catch (err) {
    error = err instanceof Error ? err.message : 'Failed to fetch repositories';
  }

  return <ReposPageClient initialRepos={repos} initialError={error} />;
}
