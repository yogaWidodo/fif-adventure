'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { getRoleRedirect } from '@/lib/auth';

type AllowedRole = 'admin' | 'captain' | 'vice_captain' | 'lo' | 'member';

interface AuthGuardProps {
  children: React.ReactNode;
  allowedRoles: AllowedRole[];
}

export default function AuthGuard({ children, allowedRoles }: AuthGuardProps) {
  const { userRole, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (isLoading) return;

    // Unauthenticated: redirect to login with return path
    if (!userRole) {
      router.push(`/login?redirect=${encodeURIComponent(pathname)}`);
      return;
    }

    // Authenticated but not authorized for this route: redirect to role home
    if (!allowedRoles.includes(userRole as AllowedRole)) {
      router.push(getRoleRedirect(userRole));
    }
  }, [userRole, isLoading, router, pathname, allowedRoles]);

  if (isLoading || !userRole || !allowedRoles.includes(userRole as AllowedRole)) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-12">
        <div className="flex flex-col items-center gap-4 opacity-50 italic">
          <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          <p className="font-adventure text-primary tracking-widest text-sm">Verifying Credentials...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
