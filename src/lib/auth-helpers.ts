import { auth } from './auth';

export class AuthenticationError extends Error {
  constructor(message = 'Authentication required') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export interface AuthenticatedUser {
  id: string;
  dbId: number;
  githubId: number;
  name: string | null;
  email: string | null;
  image: string | null;
  accessToken: string;
}

/**
 * Get the authenticated user from the current session.
 * Throws AuthenticationError if not authenticated.
 */
export async function getAuthenticatedUser(): Promise<AuthenticatedUser> {
  const session = await auth();

  if (!session?.user || !session.accessToken) {
    throw new AuthenticationError();
  }

  if (!session.user.dbId) {
    throw new AuthenticationError('User not found in database');
  }

  return {
    id: session.user.id,
    dbId: session.user.dbId,
    githubId: session.user.githubId!,
    name: session.user.name ?? null,
    email: session.user.email ?? null,
    image: session.user.image ?? null,
    accessToken: session.accessToken,
  };
}

/**
 * Get the GitHub OAuth token from the current session.
 * Throws AuthenticationError if not authenticated.
 */
export async function getGitHubToken(): Promise<string> {
  const user = await getAuthenticatedUser();
  return user.accessToken;
}
