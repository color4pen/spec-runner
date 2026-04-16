import { Dashboard } from '@/app/_components/dashboard';
import { listAgents, listEnvironments, listSessions } from '@/lib/actions';

export const dynamic = 'force-dynamic';

export default async function DebugPage() {
  const [agents, environments, sessions] = await Promise.all([
    listAgents().catch(() => []),
    listEnvironments().catch(() => []),
    listSessions().catch(() => []),
  ]);

  return (
    <Dashboard
      initialAgents={agents}
      initialEnvironments={environments}
      initialSessions={sessions}
    />
  );
}
