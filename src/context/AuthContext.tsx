'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

type Role = 'admin' | 'captain' | 'vice_captain' | 'lo' | 'member' | null;

interface User {
  id: string;
  name: string;
  npk: string;
  role: Role;
  team_id?: string;
}

interface AuthContextType {
  userRole: Role;
  user: User | null;
  login: (npk: string, birthDate: string) => Promise<{ success: boolean; role?: Role; userId?: string; error?: string }>;
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
          const npk = session.user.email?.split('@')[0] || '';
          // Re-fetch user profile
          const { data: profile } = await supabase
            .from('users')
            .select('id, name, npk, role, team_id')
            .ilike('npk', npk)
            .maybeSingle();

          if (profile) {
            const userData: User = {
              id: profile.id,
              name: profile.name,
              npk: profile.npk ?? '',
              role: profile.role as Role,
              team_id: profile.team_id ?? undefined,
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
        localStorage.removeItem('fif_access_token');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const login = async (npk: string, birthDate: string): Promise<{ success: boolean; role?: Role; userId?: string; error?: string }> => {
    const MAX_RETRIES = 3;

    const attemptLogin = async (attempt: number): Promise<Response> => {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ npk, birth_date: birthDate }),
      });

      // Retry on 429 (rate limit) with exponential backoff
      if (response.status === 429 && attempt < MAX_RETRIES) {
        const backoff = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
        await new Promise(r => setTimeout(r, backoff));
        return attemptLogin(attempt + 1);
      }

      return response;
    };

    try {
      const response = await attemptLogin(0);

      if (!response.ok) {
        const errorData = await response.json();
        return { success: false, error: errorData.error || 'Terjadi kesalahan saat masuk.' };
      }

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
            name: data.user.name,
            npk: data.user.npk ?? '',
            role,
            team_id: data.user.team_id ?? undefined,
          };
          setUser(userData);
          localStorage.setItem('fif_user', JSON.stringify(userData));
          localStorage.setItem('fif_access_token', data.session.access_token);
          return { success: true, role, userId: data.user.id };
        }
      }

      return { success: false, error: 'Koneksi gagal. Silakan coba lagi.' };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false };
    }
  };

  const logout = async () => {
    try {
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
