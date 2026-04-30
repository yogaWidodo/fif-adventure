'use client';

import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter, useSearchParams } from 'next/navigation';
import { Hash, Calendar, ChevronRight, MapPin, Loader2, ShieldAlert } from 'lucide-react';
import { getRoleRedirect } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

type GeoStatus = 'idle' | 'locating' | 'success' | 'denied' | 'out_of_range' | 'skipped';

export default function LoginForm() {
  const [npk, setNpk] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [geoStatus, setGeoStatus] = useState<GeoStatus>('idle');
  const [geoMessage, setGeoMessage] = useState('');

  const { login, logout } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || null;

    /** After successful login, try to record attendance via geolocation */
  const recordAttendance = async (userId: string, destination: string) => {
    // 1. Check if geofence is enabled
    const { data: geoSetting } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'geofence_enabled')
      .maybeSingle();
    
    const isGeofenceEnabled = geoSetting?.value === 'true';

    // 2. If geofence is disabled, skip geolocation request
    if (!isGeofenceEnabled) {
      setGeoStatus('success');
      setGeoMessage('Ekspedisi dimulai!');
      await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      });
      setTimeout(() => router.push(destination), 800);
      return;
    }

    // 3. Admin tidak perlu absensi geolokasi (though we already checked this in handleSubmit)
    setGeoStatus('locating');
    setGeoMessage('Mendeteksi lokasi Anda...');

    if (!navigator.geolocation) {
      // No geolocation support
      setGeoStatus('skipped');
      await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      });
      router.push(destination);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        const res = await fetch('/api/attendance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: userId, lat, lng }),
        });

        if (res.ok) {
          //  Within geofence or geofence disabled — proceed
          setGeoStatus('success');
          setGeoMessage('Kehadiran tercatat!');
          setTimeout(() => router.push(destination), 800);
        } else {
          const data = await res.json();
          if (res.status === 403) {
            // Outside geofence — BLOCK login, destroy session
            setGeoStatus('out_of_range');
            setGeoMessage(data.error ?? 'Anda tidak berada di lokasi acara.');
            setIsSubmitting(false);
            await logout(); // Destroy the session so they can't access protected routes
          } else {
            // Other server error — allow through
            setGeoStatus('skipped');
            setTimeout(() => router.push(destination), 800);
          }
        }
      },
      async () => {
        // User denied location permission
        // Send without coords — server decides based on geofence_enabled setting
        const res = await fetch('/api/attendance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: userId }),
        });

        if (res.ok) {
          // Geofence not enforced or geofence disabled — let through
          setGeoStatus('denied');
          setGeoMessage('Izin lokasi ditolak. Absensi dicatat tanpa verifikasi lokasi.');
          setTimeout(() => router.push(destination), 2000);
        } else {
          // Geofence is ON but no coords provided → block
          setGeoStatus('out_of_range');
          setGeoMessage('Izin lokasi diperlukan untuk masuk. Aktifkan lokasi di browser Anda dan coba lagi.');
          setIsSubmitting(false);
          await logout();
        }
      },
      { timeout: 8000, maximumAge: 0 }
    );
  };

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
      const destination = result.role === 'admin'
        ? '/admin'
        : (redirect ?? getRoleRedirect(result.role));

      // Admin skips geolocation — redirect directly
      if (result.role === 'admin') {
        router.push(destination);
        return;
      }

      // For all non-admin roles, record attendance with geolocation
      if (result.userId) {
        await recordAttendance(result.userId, destination);
      } else {
        router.push(destination);
      }
    } else {
      setError(result.error || 'Kredensial tidak dikenali. Silakan periksa kembali NPK dan Tanggal Lahir Anda.');
      setIsSubmitting(false);
    }
  };

  const isLocating = geoStatus === 'locating';
  const showGeoFeedback = geoStatus !== 'idle' && geoStatus !== 'success';

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

      {/* Geolocation Feedback */}
      {isLocating && (
        <div className="adventure-card p-4 bg-primary/5 border-primary/20 flex items-center gap-3">
          <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />
          <p className="text-[10px] font-adventure uppercase tracking-widest text-primary/70">{geoMessage}</p>
        </div>
      )}

      {/* Blocking: Out of Range */}
      {geoStatus === 'out_of_range' && !isLocating && (
        <div className="adventure-card p-6 bg-red-950/60 border-red-500/50 flex flex-col items-center gap-3 text-center">
          <ShieldAlert className="w-8 h-8 text-red-400" />
          <p className="text-[11px] font-adventure uppercase tracking-widest text-red-300">Akses Ditolak</p>
          <p className="text-xs text-red-400/80 font-content leading-relaxed">{geoMessage}</p>
          <p className="text-[10px] text-red-500/50 font-adventure italic">Hadir di lokasi acara dan login ulang.</p>
        </div>
      )}

      {/* Non-blocking feedback */}
      {showGeoFeedback && !isLocating && geoStatus !== 'out_of_range' && (
        <div className={`adventure-card p-4 flex items-center gap-3 ${
          geoStatus === 'denied'
          ? 'bg-amber-900/20 border-amber-500/30'
          : 'bg-primary/5 border-primary/20'
        }`}>
          <MapPin className={`w-4 h-4 shrink-0 ${
            geoStatus === 'denied' ? 'text-amber-400' : 'text-primary'
          }`} />
          <p className={`text-[10px] font-adventure uppercase tracking-widest ${
            geoStatus === 'denied' ? 'text-amber-400' : 'text-primary/70'
          }`}>{geoMessage}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={isSubmitting || isLocating || geoStatus === 'out_of_range'}
        className="w-full bg-primary text-primary-foreground py-5 font-adventure text-lg uppercase tracking-[0.2em] shadow-[0_10px_30px_rgba(212,175,55,0.2)] hover:scale-[1.02] active:scale-[0.98] transition-all relative overflow-hidden group disabled:opacity-60 disabled:cursor-not-allowed disabled:scale-100"
      >
        <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
        <span className="flex items-center justify-center gap-3">
          {isSubmitting && !isLocating ? 'Memverifikasi...' : isLocating ? 'Mendeteksi Lokasi...' : geoStatus === 'out_of_range' ? 'Akses Ditolak' : 'Mulai Ekspedisi'}
          {isLocating ? <Loader2 className="w-5 h-5 animate-spin" /> : geoStatus === 'out_of_range' ? <ShieldAlert className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
        </span>
      </button>
    </form>
  );
}
