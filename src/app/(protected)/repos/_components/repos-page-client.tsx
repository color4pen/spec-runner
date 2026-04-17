'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  listGitHubReposForRegistration,
  registerRepository,
  type GitHubSearchResult,
  type RepositoryWithStatus,
} from '@/lib/repository-registration-actions';
import type { BootstrapStatus } from '@/lib/bootstrap-utils';

const BOOTSTRAP_BADGES: Record<BootstrapStatus, { label: string; className: string }> = {
  uninitialized: { label: 'Not bootstrapped', className: 'bg-gray-100 text-gray-600' },
  bootstrapping: { label: 'Bootstrapping...', className: 'bg-yellow-100 text-yellow-700 animate-pulse' },
  pr_pending: { label: 'PR pending', className: 'bg-blue-100 text-blue-700' },
  ready: { label: 'Ready', className: 'bg-green-100 text-green-700' },
};

interface ReposPageClientProps {
  initialRepos: RepositoryWithStatus[];
  initialError: string | null;
}

export function ReposPageClient({ initialRepos, initialError }: ReposPageClientProps) {
  const router = useRouter();
  const [repos, setRepos] = useState<RepositoryWithStatus[]>(initialRepos);
  const [error] = useState<string | null>(initialError);

  // Dialog state
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');
  const [allGitHubRepos, setAllGitHubRepos] = useState<GitHubSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);

  const filteredResults = allGitHubRepos.filter((repo) => {
    if (!filterQuery.trim()) return true;
    const q = filterQuery.toLowerCase();
    return (
      repo.fullName.toLowerCase().includes(q) ||
      (repo.description?.toLowerCase().includes(q) ?? false) ||
      (repo.language?.toLowerCase().includes(q) ?? false)
    );
  });

  const handleOpenDialog = useCallback(async () => {
    setShowAddDialog(true);
    setIsLoading(true);
    setSearchError(null);
    try {
      const results = await listGitHubReposForRegistration();
      setAllGitHubRepos(results);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Failed to load repositories');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleRegister = useCallback(async (owner: string, name: string) => {
    setIsRegistering(true);
    setSearchError(null);
    try {
      const registered = await registerRepository(owner, name);
      setRepos((prev) => [registered, ...prev]);
      // Mark as registered in the dialog list
      setAllGitHubRepos((prev) =>
        prev.map((r) =>
          r.fullName === `${owner}/${name}` ? { ...r, alreadyRegistered: true } : r
        )
      );
      router.refresh();
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setIsRegistering(false);
    }
  }, [router]);

  const handleCloseDialog = () => {
    setShowAddDialog(false);
    setFilterQuery('');
    setSearchError(null);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Your Repositories</h2>
          <p className="text-sm text-gray-500 mt-1">
            Registered repositories managed by SpecRunner
          </p>
        </div>
        <button
          onClick={handleOpenDialog}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors"
        >
          Add Repository
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-6">
          {error}
        </div>
      )}

      {repos.length === 0 && !error && (
        <div className="text-center py-12 text-gray-500">
          <p>No repositories registered yet.</p>
          <p className="text-sm mt-1">
            Click{' '}
            <button
              onClick={handleOpenDialog}
              className="text-blue-600 underline hover:text-blue-800"
            >
              Add Repository
            </button>{' '}
            to get started.
          </p>
        </div>
      )}

      {repos.length > 0 && (
        <div className="grid gap-3">
          {repos.map((repo) => {
            const badge = BOOTSTRAP_BADGES[repo.bootstrapStatus as BootstrapStatus] ?? BOOTSTRAP_BADGES.uninitialized;
            return (
              <Link
                key={repo.id}
                href={`/repos/${repo.owner}/${repo.name}`}
                className="block bg-white border border-gray-200 rounded-lg p-4 hover:border-blue-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-blue-600 truncate">
                        {repo.owner}/{repo.name}
                      </h3>
                      <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${badge.className}`}>
                        {badge.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-2">
                      {repo.defaultBranch && (
                        <span className="text-xs text-gray-400">
                          branch: {repo.defaultBranch}
                        </span>
                      )}
                      <span className="text-xs text-gray-400">
                        {repo.requestCount} request{repo.requestCount !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Add Repository Dialog */}
      {showAddDialog && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleCloseDialog();
          }}
        >
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Add Repository</h3>
              <button
                onClick={handleCloseDialog}
                className="text-gray-400 hover:text-gray-600"
              >
                X
              </button>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Select a repository to register
              </label>
              <input
                type="text"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                placeholder="Filter repositories..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>

            {searchError && (
              <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                {searchError}
              </div>
            )}

            {isLoading && (
              <div className="text-sm text-gray-500 text-center py-4">
                Loading repositories...
              </div>
            )}

            {!isLoading && filteredResults.length > 0 && (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {filteredResults.map((result) => (
                  <div
                    key={result.id}
                    className={`p-3 border rounded-lg flex items-center justify-between ${
                      result.alreadyRegistered
                        ? 'bg-gray-50 border-gray-200 opacity-60'
                        : 'bg-white border-gray-200 hover:border-blue-300 cursor-pointer'
                    }`}
                    onClick={() => {
                      if (!result.alreadyRegistered && !isRegistering) {
                        void handleRegister(result.owner, result.name);
                      }
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900 truncate">
                          {result.fullName}
                        </span>
                        {result.private && (
                          <span className="px-1.5 py-0.5 text-xs border border-gray-300 rounded text-gray-500">
                            Private
                          </span>
                        )}
                        {result.alreadyRegistered && (
                          <span className="px-1.5 py-0.5 text-xs bg-green-100 text-green-700 rounded">
                            Registered
                          </span>
                        )}
                      </div>
                      {result.description && (
                        <p className="text-xs text-gray-500 mt-1 line-clamp-1">
                          {result.description}
                        </p>
                      )}
                      {result.language && (
                        <span className="text-xs text-gray-400">{result.language}</span>
                      )}
                    </div>
                    {!result.alreadyRegistered && (
                      <span className="ml-3 text-xs text-blue-600 font-medium shrink-0">
                        {isRegistering ? 'Adding...' : 'Add'}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {!isLoading && allGitHubRepos.length > 0 && filteredResults.length === 0 && (
              <div className="text-sm text-gray-500 text-center py-4">
                No repositories match &quot;{filterQuery}&quot;
              </div>
            )}

            {!isLoading && allGitHubRepos.length === 0 && !searchError && (
              <div className="text-sm text-gray-500 text-center py-4">
                No repositories found on your GitHub account.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
