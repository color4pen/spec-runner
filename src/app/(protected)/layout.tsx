import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { Header } from './_components/header';

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header user={session.user} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
