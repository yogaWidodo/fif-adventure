'use client';

import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter, useSearchParams } from 'next/navigation';
import { Hash, Calendar, ChevronRight } from 'lucide-react';
import { getRoleRedirect } from '@/lib/auth';

export default function LoginForm() {
  const [npk, setNpk] = useState('');
  const [birthDate, setBirthDate] = useState('');
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

    if (birthDate.length !== 8 || !/^\d{8}$/.test(birthDate)) {
      setError('Format tanggal lahir salah (DDMMYYYY).');
      setIsSubmitting(false);
      return;
    }

    const result = await login(npk, birthDate);

    if (result.success && result.role) {
      if (result.role === 'admin') {
        router.push('/admin');
        return;
      }

      router.push(redirect ?? getRoleRedirect(result.role));
    } else {
      setError('Kredensial tidak dikenali. Silakan periksa kembali NPK dan Tanggal Lahir Anda.');
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* NPK Field */}
      <div className="adventure-card p-6 bg-black/60 border-primary/20">
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
          placeholder="Masukkan NPK..."
          required
          autoComplete="username"
          className="w-full bg-transparent border-b border-primary/20 p-2 font-content text-lg text-parchment placeholder:text-foreground/20 focus:outline-none focus:border-primary transition-colors"
        />
      </div>

      {/* Birth Date Field */}
      <div className="adventure-card p-6 bg-black/60 border-primary/20">
        <div className="flex items-center gap-3 mb-4">
          <Calendar className="w-4 h-4 text-primary" />
          <label htmlFor="birthDate" className="text-[10px] uppercase tracking-widest font-adventure text-primary">
            Tanggal Lahir (DDMMYYYY)
          </label>
        </div>
        <input
          id="birthDate"
          type="password"
          value={birthDate}
          onChange={(e) => { 
            const val = e.target.value.replace(/\D/g, '').slice(0, 8);
            setBirthDate(val); 
            setError(''); 
          }}
          placeholder="DDMMYYYY"
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
          {isSubmitting ? 'Memverifikasi...' : 'Mulai Ekspedisi'}
          <ChevronRight className="w-5 h-5" />
        </span>
      </button>
    </form>
  );
}
