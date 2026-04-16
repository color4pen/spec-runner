import NextAuth from 'next-auth';
import GitHub from 'next-auth/providers/github';
import { getDb } from './db';
import { users } from './db/schema';
import { eq } from 'drizzle-orm';

declare module 'next-auth' {
  interface Session {
    accessToken?: string;
    user: {
      id: string;
      dbId?: number;
      githubId?: number;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    accessToken?: string;
    githubId?: number;
    dbId?: number;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    GitHub({
      authorization: {
        params: {
          scope: 'repo read:user user:email',
        },
      },
    }),
  ],
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === 'github' && profile) {
        try {
          const db = getDb();
          const githubId = Number(profile.id);
          const githubLogin = (profile.login as string) || user.name || '';
          const githubAvatarUrl = user.image || (profile.avatar_url as string) || '';

          // Upsert user: insert or update on conflict
          const existing = await db.query.users.findFirst({
            where: eq(users.githubId, githubId),
          });

          if (existing) {
            await db
              .update(users)
              .set({
                githubLogin,
                githubAvatarUrl,
              })
              .where(eq(users.githubId, githubId));
          } else {
            await db.insert(users).values({
              githubId,
              githubLogin,
              githubAvatarUrl,
            });
          }
        } catch (err) {
          console.error('Failed to upsert user:', err);
          // Don't block sign in on DB errors
        }
      }
      return true;
    },
    async jwt({ token, account, profile }) {
      // On initial sign in, persist the access token and github ID
      if (account) {
        token.accessToken = account.access_token;
        token.githubId = Number(profile?.id);

        // Look up DB id
        try {
          const db = getDb();
          const dbUser = await db.query.users.findFirst({
            where: eq(users.githubId, token.githubId!),
          });
          if (dbUser) {
            token.dbId = dbUser.id;
          }
        } catch {
          // Non-blocking
        }
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken;
      if (token.sub) {
        session.user.id = token.sub;
      }
      session.user.githubId = token.githubId;
      session.user.dbId = token.dbId;
      return session;
    },
  },
});
