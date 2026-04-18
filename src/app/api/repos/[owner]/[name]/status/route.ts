import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { repositories, requests } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ owner: string; name: string }> }
) {
  // Authentication check
  const session = await auth();
  if (!session?.user?.dbId) {
    return new Response(
      JSON.stringify({ error: 'Authentication required' }),
      {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  const userDbId = session.user.dbId;
  const { owner, name } = await params;

  const db = getDb();

  // Fetch repository — ownership check included via user_id filter (IDOR prevention)
  const [repo] = await db
    .select({
      id: repositories.id,
      bootstrapStatus: repositories.bootstrapStatus,
      bootstrapPrUrl: repositories.bootstrapPrUrl,
      userId: repositories.userId,
    })
    .from(repositories)
    .where(
      and(
        eq(repositories.owner, owner),
        eq(repositories.name, name),
        eq(repositories.userId, userDbId)
      )
    );

  if (!repo) {
    return new Response(
      JSON.stringify({ error: 'Repository not found' }),
      {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  // Get the latest request status for this repository
  const [latestRequest] = await db
    .select({ status: requests.status })
    .from(requests)
    .where(eq(requests.repositoryId, repo.id))
    .orderBy(desc(requests.createdAt))
    .limit(1);

  const requestStatus = latestRequest?.status ?? null;

  return new Response(
    JSON.stringify({
      bootstrapStatus: repo.bootstrapStatus,
      bootstrapPrUrl: repo.bootstrapPrUrl,
      requestStatus,
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}
