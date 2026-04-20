'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Gem, Skull, Sparkles, Star, Loader2 } from 'lucide-react';

export default function CaptainGachaListener() {
  const { user } = useAuth();
  const [hasUnrolledGacha, setHasUnrolledGacha] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);
  const [gachaResult, setGachaResult] = useState<{ won: boolean; treasureName: string | null } | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  // Flag to avoid checking while already in a spin process
  const activeProcessRef = useRef(false);

  useEffect(() => {
    // Only Captains/Vice Captains with a team should poll
    if (!user?.team_id || !user?.role || !['captain', 'vice_captain'].includes(user.role)) return;

    const checkGacha = async () => {
      // TypeScript narrowing for closure
      if (!user?.team_id) return;
      // Don't poll if we're currently showing/processing the gacha
      if (activeProcessRef.current) return;

      const { data } = await supabase
        .from('score_logs')
        .select('id')
        .eq('team_id', user.team_id)
        .eq('gacha_rolled', false)
        .limit(1)
        .maybeSingle();

      if (data && data.id) {
        setHasUnrolledGacha(true);
        activeProcessRef.current = true;
      }
    };

    // Initial check
    checkGacha();

    // Setup polling every 5 seconds (fallback incase realtime doesn't hit)
    const interval = setInterval(checkGacha, 5000);
    return () => clearInterval(interval);
  }, [user]);

  const handleSpinClick = async () => {
    if (isSpinning) return;
    setIsSpinning(true);
    setErrorMsg('');

    try {
      // 1. Dapatkan akses token jika diperlukan (sudah dihandle oleh cookies/session biasanya)
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || localStorage.getItem('fif_access_token');

      // 2. Tembak API
      const res = await fetch('/api/captain/gacha', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Terjadi kesalahan');
      }

      const data = await res.json();
      
      // Tunggu animasi artificial 3.5 detik untuk efek tegang
      setTimeout(() => {
        setIsSpinning(false);
        setGachaResult({
          won: data.gacha_result.won,
          treasureName: data.gacha_result.treasure?.name || null
        });
      }, 3500);

    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memutar Gacha. Silakan coba lagi.');
      setIsSpinning(false);
    }
  };

  const handleClose = () => {
    setGachaResult(null);
    setHasUnrolledGacha(false);
    activeProcessRef.current = false;
    // Pemicu halaman agar update (bisa digabung global state nanti jika butuh)
    window.location.reload();
  };

  return (
    <AnimatePresence>
      {hasUnrolledGacha && (
        <motion.div
           initial={{ opacity: 0 }}
           animate={{ opacity: 1 }}
           exit={{ opacity: 0 }}
           className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
           style={{ background: 'rgba(5, 12, 8, 0.95)' }}
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            className="adventure-card w-full max-w-sm mx-auto overflow-hidden border-[3px] border-primary/40 shadow-[0_0_60px_rgba(212,175,55,0.3)] bg-black/90 p-8 text-center flex flex-col items-center"
          >
            {/* Keadaan 1: Menunggu pencetan SPIN */}
            {!isSpinning && !gachaResult && (
               <motion.div 
                 initial={{ opacity: 0 }} animate={{ opacity: 1 }} 
                 className="flex flex-col items-center"
               >
                 <div className="bg-primary/20 p-5 rounded-full border border-primary/40 mb-6">
                   <Sparkles className="w-12 h-12 text-primary torch-glow animate-pulse" />
                 </div>
                 <h2 className="font-adventure text-3xl gold-engraving mb-4">Wahana Selesai!</h2>
                 <p className="text-sm font-content text-primary/70 italic mb-8 px-4 leading-relaxed">
                   Tim Anda mendapatkan 1 kesempatan untuk menebak Hint Rahasia.
                 </p>

                 {errorMsg && (
                    <p className="text-xs text-red-400 mb-4 font-content">{errorMsg}</p>
                 )}

                 <button
                   onClick={handleSpinClick}
                   className="w-full bg-primary text-primary-foreground font-adventure text-xl uppercase tracking-widest py-4 px-6 shadow-lg hover:bg-primary/80 transition-all border-2 border-primary/40 rounded-sm"
                 >
                   Putar Gacha
                 </button>
               </motion.div>
            )}

            {/* Keadaan 2: Animasi Spin Berjalan */}
            {isSpinning && (
               <motion.div 
                 initial={{ opacity: 0 }} animate={{ opacity: 1 }} 
                 className="flex flex-col items-center py-6 w-full"
               >
                 <p className="text-[12px] uppercase font-adventure tracking-widest text-primary/60 mb-6">
                    Mencari Petunjuk...
                 </p>
                 <div className="relative w-full h-32 overflow-hidden border-2 border-primary/30 bg-black/60 rounded-sm">
                   <motion.div
                     className="flex flex-col items-center gap-6 absolute inset-x-0"
                     initial={{ y: 0 }}
                     animate={{ y: [-1000, -2000, -3000, -4200] }}
                     transition={{ duration: 3.5, ease: [0.12, 0.8, 0.2, 1] }}
                   >
                     {Array.from({ length: 150 }).map((_, i) => (
                       <div key={i} className="flex flex-col items-center justify-center h-16 w-full flex-shrink-0">
                         {i % 3 === 0 ? <Gem className="w-12 h-12 text-primary" /> : i % 3 === 1 ? <Skull className="w-12 h-12 text-red-400/60" /> : <Star className="w-12 h-12 text-yellow-500/40" />}
                       </div>
                     ))}
                   </motion.div>
                   <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-20 border-y-2 border-primary/50 pointer-events-none shadow-[inset_0_0_20px_rgba(212,175,55,0.2)]" />
                   <div className="absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-black to-transparent pointer-events-none" />
                   <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black to-transparent pointer-events-none" />
                 </div>
               </motion.div>
            )}

            {/* Keadaan 3: Hasil Result */}
            {!isSpinning && gachaResult && (
               <motion.div 
                 initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} 
                 className="flex flex-col items-center py-4 w-full"
               >
                 {gachaResult.won ? (
                   <>
                     <div className="bg-primary/20 p-5 rounded-full border border-primary/40 mb-6 relative">
                        <motion.div 
                          initial={{ scale: 0 }} animate={{ scale: [1.2, 1] }} transition={{ type: "spring", bounce: 0.5 }}
                        >
                          <Gem className="w-16 h-16 text-primary torch-glow" />
                        </motion.div>
                        <div className="absolute inset-0 bg-primary/20 blur-xl animate-pulse rounded-full" />
                     </div>
                     <h2 className="font-adventure text-4xl text-primary tracking-tighter mb-4 text-glow">Hint Tertangkap!</h2>
                     <p className="text-sm text-foreground/80 font-content italic mb-8 bg-primary/10 border border-primary/20 px-4 py-3 rounded-sm leading-relaxed">
                       Petunjuk area "{gachaResult.treasureName}" kini tersimpan di Journal Anda.
                     </p>
                   </>
                 ) : (
                   <>
                     <div className="bg-red-500/10 p-5 rounded-full border border-red-500/20 mb-6">
                       <Skull className="w-16 h-16 text-red-500/80" />
                     </div>
                     <h2 className="font-adventure text-4xl text-red-400 tracking-tighter mb-4">Zonk!</h2>
                     <p className="text-sm text-red-300/80 font-content italic mb-8 px-4 leading-relaxed">
                       Tidak ada satupun petunjuk yang membekas kali ini. Teruslah berjuang!
                     </p>
                   </>
                 )}
                 
                 <button
                   onClick={handleClose}
                   className="w-full bg-black border border-primary/30 text-primary font-adventure text-lg uppercase tracking-widest py-3 px-6 hover:bg-primary/10 transition-colors"
                 >
                   Tutup
                 </button>
               </motion.div>
            )}

          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
