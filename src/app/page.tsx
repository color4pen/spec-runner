import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';

export default async function RootPage() {
  const session = await auth();

  if (session?.user) {
    // Redirect to the protected repo list (which is (protected)/page.tsx)
    redirect('/repos');
  } else {
    redirect('/login');
  }
}
