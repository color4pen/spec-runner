'use server';

import { getAuthenticatedUser } from './auth-helpers';

export interface GitHubRepo {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  description: string | null;
  language: string | null;
  updatedAt: string;
  htmlUrl: string;
  private: boolean;
}

/**
 * Fetch the authenticated user's repositories from GitHub API.
 * Uses the OAuth access token from the session.
 */
export async function listUserRepos(): Promise<GitHubRepo[]> {
  const user = await getAuthenticatedUser();

  const repos: GitHubRepo[] = [];
  let page = 1;
  const perPage = 100;
  const maxPages = 10; // Cap at 1000 repos to prevent excessive API calls

  while (page <= maxPages) {
    const response = await fetch(
      `https://api.github.com/user/repos?sort=updated&direction=desc&per_page=${perPage}&page=${page}`,
      {
        headers: {
          Authorization: `Bearer ${user.accessToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('GitHub token is invalid. Please re-authenticate.');
      }
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (!Array.isArray(data) || data.length === 0) {
      break;
    }

    for (const repo of data) {
      repos.push({
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        owner: repo.owner.login,
        description: repo.description,
        language: repo.language,
        updatedAt: repo.updated_at,
        htmlUrl: repo.html_url,
        private: repo.private,
      });
    }

    if (data.length < perPage) {
      break;
    }

    page++;
  }

  return repos;
}
