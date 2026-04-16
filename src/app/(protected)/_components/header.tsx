import Link from 'next/link';
import Image from 'next/image';
import { signOut } from '@/lib/auth';

interface HeaderProps {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
}

export function Header({ user }: HeaderProps) {
  return (
    <header className="bg-white border-b border-gray-200 px-6 py-3">
      <div className="flex items-center justify-between">
        <Link href="/" className="text-xl font-semibold text-gray-900 hover:text-gray-700 transition-colors">
          SpecRunner
        </Link>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            {user.image && (
              <Image
                src={user.image}
                alt={user.name || 'User avatar'}
                width={32}
                height={32}
                className="w-8 h-8 rounded-full"
              />
            )}
            <span className="text-sm text-gray-700">{user.name}</span>
          </div>
          <form
            action={async () => {
              'use server';
              await signOut({ redirectTo: '/login' });
            }}
          >
            <button
              type="submit"
              className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
