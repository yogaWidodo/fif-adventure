'use client';

import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter, useSearchParams } from 'next/navigation';
import { User, Hash, KeyRound, ChevronRight } from 'lucide-react';
import { getRoleRedirect } from '@/lib/auth';

export default function LoginForm() {
  const [nama, setNama] = useState('');
  const [npk, setNpk] = useState('');
  const [noUnik, setNoUnik] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    const result = await login(nama, npk, noUnik);

    if (result.success && result.role) {
      router.push(redirect ?? getRoleRedirect(result.role));
    } else {
      setError('Credentials rejected. The ancient archives do not recognize you.');
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Nama Field */}
      <div className="adventure-card p-6 bg-card/40 border-primary/10 backdrop-blur-xl">
        <div className="flex items-center gap-3 mb-4">
          <User className="w-4 h-4 text-primary" />
          <label htmlFor="nama" className="text-[10px] uppercase tracking-widest font-adventure text-primary">
            Nama
          </label>
        </div>
        <input
          id="nama"
          type="text"
          value={nama}
          onChange={(e) => { setNama(e.target.value); setError(''); }}
          placeholder="Enter your name..."
          required
          autoComplete="name"
          className="w-full bg-transparent border-b border-primary/20 p-2 font-content text-lg text-parchment placeholder:text-foreground/20 focus:outline-none focus:border-primary transition-colors"
        />
      </div>

      {/* NPK Field */}
      <div className="adventure-card p-6 bg-card/40 border-primary/10 backdrop-blur-xl">
        <div className="flex items-center gap-3 mb-4">
          <Hash className="w-4 h-4 text-primary" />
          <label htmlFor="npk" className="text-[10px] uppercase tracking-widest font-adventure text-primary">
            NPK
          </label>
        </div>
        <input
          id="npk"
          type="text"
          value={npk}
          onChange={(e) => { setNpk(e.target.value); setError(''); }}
          placeholder="Enter your NPK..."
          required
          autoComplete="username"
          className="w-full bg-transparent border-b border-primary/20 p-2 font-content text-lg text-parchment placeholder:text-foreground/20 focus:outline-none focus:border-primary transition-colors"
        />
      </div>

      {/* No Unik Field */}
      <div className="adventure-card p-6 bg-card/40 border-primary/10 backdrop-blur-xl">
        <div className="flex items-center gap-3 mb-4">
          <KeyRound className="w-4 h-4 text-primary" />
          <label htmlFor="noUnik" className="text-[10px] uppercase tracking-widest font-adventure text-primary">
            No Unik
          </label>
        </div>
        <input
          id="noUnik"
          type="password"
          value={noUnik}
          onChange={(e) => { setNoUnik(e.target.value); setError(''); }}
          placeholder="Enter your unique code..."
          required
          autoComplete="current-password"
          className="w-full bg-transparent border-b border-primary/20 p-2 font-content text-lg text-parchment placeholder:text-foreground/20 focus:outline-none focus:border-primary transition-colors"
        />
        {error && (
          <p role="alert" className="text-red-500 text-[10px] uppercase font-adventure mt-4 tracking-tighter italic">
            {error}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full bg-primary text-primary-foreground py-5 font-adventure text-lg uppercase tracking-[0.2em] shadow-[0_10px_30px_rgba(212,175,55,0.2)] hover:scale-[1.02] active:scale-[0.98] transition-all relative overflow-hidden group disabled:opacity-60 disabled:cursor-not-allowed disabled:scale-100"
      >
        <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
        <span className="flex items-center justify-center gap-3">
          {isSubmitting ? 'Verifying...' : 'Proceed to Horizon'}
          <ChevronRight className="w-5 h-5" />
        </span>
      </button>
    </form>
  );
}
