import Link from 'next/link';
import { listUserRepos } from '@/lib/github';

export const dynamic = 'force-dynamic';

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 30) return `${diffDays} days ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
}

const languageColors: Record<string, string> = {
  TypeScript: 'bg-blue-500',
  JavaScript: 'bg-yellow-400',
  Python: 'bg-green-500',
  Rust: 'bg-orange-600',
  Go: 'bg-cyan-500',
  Java: 'bg-red-500',
  Ruby: 'bg-red-600',
  Swift: 'bg-orange-500',
  Kotlin: 'bg-purple-500',
  C: 'bg-gray-500',
  'C++': 'bg-pink-500',
  'C#': 'bg-green-600',
  Shell: 'bg-green-400',
  HTML: 'bg-orange-400',
  CSS: 'bg-purple-400',
};

export default async function ReposPage() {
  let repos;
  let error: string | null = null;

  try {
    repos = await listUserRepos();
  } catch (err) {
    error = err instanceof Error ? err.message : 'Failed to fetch repositories';
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900">Your Repositories</h2>
        <p className="text-sm text-gray-500 mt-1">
          Select a repository to start a new SpecRunner session
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-6">
          {error}
        </div>
      )}

      {repos && repos.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <p>No repositories found.</p>
          <p className="text-sm mt-1">
            Make sure your GitHub OAuth app has access to your repositories.
          </p>
        </div>
      )}

      {repos && repos.length > 0 && (
        <div className="grid gap-3">
          {repos.map((repo) => (
            <Link
              key={repo.id}
              href={`/repos/${repo.owner}/${repo.name}`}
              className="block bg-white border border-gray-200 rounded-lg p-4 hover:border-blue-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-blue-600 truncate">
                      {repo.owner}/{repo.name}
                    </h3>
                    {repo.private && (
                      <span className="px-1.5 py-0.5 text-xs border border-gray-300 rounded-full text-gray-500">
                        Private
                      </span>
                    )}
                  </div>
                  {repo.description && (
                    <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                      {repo.description}
                    </p>
                  )}
                  <div className="flex items-center gap-4 mt-2">
                    {repo.language && (
                      <span className="flex items-center gap-1 text-xs text-gray-500">
                        <span
                          className={`w-2.5 h-2.5 rounded-full ${languageColors[repo.language] || 'bg-gray-400'}`}
                        />
                        {repo.language}
                      </span>
                    )}
                    <span className="text-xs text-gray-400">
                      Updated {formatDate(repo.updatedAt)}
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
