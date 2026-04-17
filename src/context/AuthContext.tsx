'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

type Role = 'admin' | 'kaptain' | 'cocaptain' | 'lo' | 'member' | null;

interface User {
  id: string;
  nama: string;
  npk: string;
  role: Role;
  team_id?: string;
  event_id?: string;
}

interface AuthContextType {
  userRole: Role;
  user: User | null;
  login: (nama: string, npk: string, noUnik: string) => Promise<{ success: boolean; role?: Role; eventTimerState?: string }>;
  logout: () => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          // Re-fetch user profile from server to prevent localStorage tampering
          const { data: profile } = await supabase
            .from('users')
            .select('id, nama, npk, role, team_id, event_id')
            .eq('auth_id', session.user.id)
            .maybeSingle();

          if (profile) {
            const userData: User = {
              id: profile.id,
              nama: profile.nama,
              npk: profile.npk ?? '',
              role: profile.role as Role,
              team_id: profile.team_id ?? undefined,
              event_id: profile.event_id ?? undefined,
            };
            setUser(userData);
            localStorage.setItem('fif_user', JSON.stringify(userData));
          }
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setUser(null);
        localStorage.removeItem('fif_user');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const login = async (nama: string, npk: string, noUnik: string): Promise<{ success: boolean; role?: Role; eventTimerState?: string }> => {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nama, npk, no_unik: noUnik }),
      });

      if (!response.ok) return { success: false };

      const data = await response.json();

      if (data.session) {
        const { error } = await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });

        if (error) {
          console.error('Error setting session:', error);
          return { success: false };
        }

        if (data.user) {
          const role = data.user.role as Role;
          const userData: User = {
            id: data.user.id,
            nama: data.user.nama,
            npk: data.user.npk ?? '',
            role,
            team_id: data.user.team_id ?? undefined,
            event_id: data.user.event_id ?? undefined,
          };
          setUser(userData);
          localStorage.setItem('fif_user', JSON.stringify(userData));
          // Store access token for API calls (fallback when cookie not available)
          localStorage.setItem('fif_access_token', data.session.access_token);
          return { success: true, role, eventTimerState: data.eventTimerState ?? undefined };
        }
      }

      return { success: false };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false };
    }
  };

  const logout = async () => {
    try {
      // Clear server-side cookies
      await fetch('/api/auth/logout', { method: 'POST' });
      await supabase.auth.signOut();
      setUser(null);
      localStorage.removeItem('fif_user');
      localStorage.removeItem('fif_access_token');
      router.push('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <AuthContext.Provider value={{
      userRole: user?.role ?? null,
      user,
      login,
      logout,
      isLoading,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
