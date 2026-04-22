'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, BookOpen, Compass, ShieldAlert, QrCode, X, MapPin, Flame, Sword, Gem, Crown } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '@/context/AuthContext';
import { useTimerContext } from '@/context/TimerContext';
import AuthGuard from '@/components/AuthGuard';
import MapPanel from '@/components/MapPanel';
import { supabase } from '@/lib/supabase';
import { generateTeamBarcode } from '@/lib/auth';

export default function CaptainPortal() {
  const { logout, user } = useAuth();
  const { isExpired } = useTimerContext();
  const [showQR, setShowQR] = useState(false);
  const [discoveredActivity, setDiscoveredActivity] = useState<any>(null);
  const [discoveredHint, setDiscoveredHint] = useState<any>(null);

  // Real-time subscription for discovery (Requirement 6.1)
  useEffect(() => {
    if (!user?.team_id) return;

    const channel = supabase
      .channel(`discovery-${user.team_id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'activity_registrations',
          filter: `team_id=eq.${user.team_id}`,
        },
        async (payload) => {
          const newReg = payload.new as any;
          const { data: activity } = await supabase
            .from('activities')
            .select('id, name, description, how_to_play, type, max_points, difficulty_level')
            .eq('id', newReg.activity_id)
            .single();

          if (activity) {
            setDiscoveredActivity(activity);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'treasure_hunt_hints',
          filter: `team_id=eq.${user.team_id}`,
        },
        async (payload) => {
          const newHint = payload.new as any;
          const { data: treasure } = await supabase
            .from('treasure_hunts')
            .select('id, name, hint_text, points')
            .eq('id', newHint.treasure_hunt_id)
            .single();

          if (treasure) {
            setDiscoveredHint(treasure);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.team_id]);

  return (
    <AuthGuard allowedRoles={['admin', 'captain', 'vice_captain']}>
      <div className="fixed inset-0 overflow-y-auto overflow-x-hidden flex flex-col items-center p-6 bg-black font-content">
        {/* Background */}
        <div 
          className="fixed inset-0 z-0 bg-cover bg-center opacity-30"
          style={{ backgroundImage: 'url("/images/jungle_hq_bg.png")', filter: 'brightness(0.2)', transform: 'translateZ(0)' }}
        />
        <div className="fixed inset-0 z-10 jungle-overlay opacity-5 pointer-events-none" style={{ transform: 'translateZ(0)' }} />

        {/* Hint Discovery Modal — Cinematic reveal for Private Hints */}
        <AnimatePresence>
          {discoveredHint && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[110] bg-black/95 flex items-center justify-center p-6"
            >
              <motion.div
                initial={{ scale: 0.8, opacity: 0, rotateY: 30 }}
                animate={{ scale: 1, opacity: 1, rotateY: 0 }}
                exit={{ scale: 0.8, opacity: 0 }}
                className="adventure-card w-full max-w-md overflow-hidden border-primary/40 shadow-[0_0_60px_rgba(var(--primary-rgb),0.3)]"
              >
                <div className="relative h-40 bg-primary/20 flex flex-col items-center justify-center">
                   <div className="absolute inset-0 bg-[url('/images/expedition_map_bg.png')] bg-cover bg-center opacity-30 animate-pulse" />
                   <div className="relative z-10 bg-primary/20 p-4 rounded-full border border-primary/40 mb-3">
                     <Gem className="w-8 h-8 text-primary torch-glow" />
                   </div>
                   <h2 className="relative z-10 font-adventure text-2xl gold-engraving tracking-widest text-center px-6">
                     Secret Hint Unlocked!
                   </h2>
                </div>

                <div className="p-8 text-center space-y-6">
                   <div className="space-y-2">
                     <p className="text-[10px] uppercase font-adventure text-primary tracking-[0.4em] opacity-60">{discoveredHint.name}</p>
                     <div className="bg-[#2b1d0e]/20 border border-[#8b4513]/20 p-5 rounded-sm">
                       <p className="text-sm font-content text-foreground/90 italic leading-relaxed">
                         "💡 {discoveredHint.hint_text}"
                       </p>
                     </div>
                   </div>
                   
                   <p className="text-[10px] text-foreground/40 font-content italic">
                     "Hint ini telah dicatat dalam Jurnal Kapten."
                   </p>
                </div>

                <div className="p-6 bg-primary/5 border-t border-primary/10">
                   <button
                     onClick={() => setDiscoveredHint(null)}
                     className="w-full py-4 font-adventure text-sm uppercase tracking-[0.4em] bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-[0_10px_20px_rgba(0,0,0,0.4)] active:scale-95"
                   >
                     Secure Discovery
                   </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Discovery Modal — Cinematic reveal (Requirement 6.2) */}
        <AnimatePresence>
          {discoveredActivity && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-6"
            >
              <motion.div
                initial={{ scale: 0.8, opacity: 0, rotateX: 30 }}
                animate={{ scale: 1, opacity: 1, rotateX: 0 }}
                exit={{ scale: 0.8, opacity: 0 }}
                className="adventure-card w-full max-w-lg overflow-hidden border-primary/40 shadow-[0_0_60px_rgba(var(--primary-rgb),0.3)]"
              >
                <div className="relative h-48 bg-primary/20 flex flex-col items-center justify-center">
                   <div className="absolute inset-0 bg-[url('/images/expedition_map_bg.png')] bg-cover bg-center opacity-30 animate-pulse" />
                   <div className="relative z-10 bg-primary/20 p-5 rounded-full border border-primary/40 mb-4">
                     {discoveredActivity.type === 'wahana' ? (
                       <MapPin className="w-10 h-10 text-primary torch-glow" />
                     ) : (
                       <Sword className="w-10 h-10 text-primary torch-glow" />
                     )}
                   </div>
                   <h2 className="relative z-10 font-adventure text-3xl md:text-4xl gold-engraving tracking-widest text-center px-6">
                     {discoveredActivity.name}
                   </h2>
                   <div className="relative z-10 mt-2">
                     <DifficultyBadge level={discoveredActivity.difficulty_level} />
                   </div>
                </div>

                <div className="p-8 text-center space-y-6">
                   <div className="space-y-2">
                     <p className="text-[10px] uppercase font-adventure text-primary tracking-[0.4em] opacity-60">Discovery Unlocked</p>
                     <p className="text-sm font-content text-foreground/80 italic leading-relaxed">
                       "{discoveredActivity.description || 'A new path has been revealed. Seek the artifacts within.'}"
                     </p>
                   </div>
                   <div className="bg-primary/5 border border-primary/10 p-5 rounded-sm">
                      <p className="text-[10px] uppercase font-adventure text-primary/40 tracking-widest mb-3">Field Instructions</p>
                      <p className="text-xs font-content text-foreground/70 leading-relaxed text-left">
                        {discoveredActivity.how_to_play || 'Follow the guidance of the Station Officer to complete this task.'}
                      </p>
                   </div>
                </div>

                <div className="p-6 bg-primary/5 border-t border-primary/10">
                   <button
                     onClick={() => setDiscoveredActivity(null)}
                     className="w-full py-4 font-adventure text-sm uppercase tracking-[0.4em] bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-[0_10px_20px_rgba(0,0,0,0.4)] active:scale-95"
                   >
                     Accept Mission
                   </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* QR Code Modal */}
        <AnimatePresence>
          {showQR && user?.team_id && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[95] bg-black/95 flex items-center justify-center p-6"
              onClick={() => setShowQR(false)}
            >
              <motion.div
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.85, opacity: 0 }}
                className="adventure-card p-6 md:p-8 max-w-sm w-full text-center border-primary/30 relative"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => setShowQR(false)}
                  className="absolute top-4 right-4 z-50 text-foreground/40 hover:text-primary transition-colors bg-black/80 p-2 rounded-full"
                >
                  <X className="w-4 h-4" />
                </button>
                
                {/* Digital Pass Aesthetic - Optimized */}
                <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-black to-black opacity-80 rounded-lg pointer-events-none" />
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-1 bg-primary/50 rounded-b" />
                
                <div className="relative z-10">
                  <div className="flex items-center justify-center gap-2 mb-4">
                    <span className="h-px w-6 bg-primary/40" />
                    <p className="text-[10px] uppercase font-adventure tracking-[0.4em] text-primary">Access Pass</p>
                    <span className="h-px w-6 bg-primary/40" />
                  </div>

                  <h2 className="font-adventure text-3xl gold-engraving mb-1">{user.name}</h2>
                  <p className="text-[11px] uppercase tracking-widest text-primary/70 mb-6 font-adventure flex items-center justify-center gap-2">
                    <Crown className="w-3 h-3 text-primary" />
                    Captain • FIF Expedition
                  </p>

                  <div className="bg-white/95 p-5 rounded-xl inline-block mb-6 border border-primary/20 relative">
                    <div className="absolute -inset-1 border border-primary/30 rounded-xl pointer-events-none opacity-50" />
                    <QRCodeSVG
                      value={generateTeamBarcode(user.team_id)}
                      size={180}
                      level="M"
                      includeMargin={false}
                    />
                  </div>
                  
                  <div className="bg-primary/5 border border-primary/10 p-3 rounded-lg text-left">
                    <p className="text-[9px] uppercase font-adventure text-primary/50 tracking-widest mb-1">Pass Instructions</p>
                    <p className="text-xs text-foreground/60 italic font-content leading-relaxed">
                      Tunjukkan pass ini kepada Station Officer di wahana untuk memvalidasi partisipasi Anda dan mewakili tim.
                    </p>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <header className="relative z-20 mt-12 mb-12 text-center max-w-lg">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-primary/20 p-3 md:p-5 rounded-full w-fit mx-auto mb-4 md:mb-6 border border-primary/20"
          >
            <Compass className="text-primary w-10 h-10 md:w-12 md:h-12 torch-glow" />
          </motion.div>
          <h1 className="font-adventure text-4xl md:text-6xl gold-engraving mb-4">Captain's Log</h1>
          <p className="text-muted-foreground italic text-sm opacity-70 px-4">
            "The path is treacherous, and the artifacts are well-hidden. Are you prepared to lead your team to victory?"
          </p>
        </header>

        <div className="relative z-20 grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl px-4">
          {/* Main Action: Scan */}
          <Link href="/captain/scan" className="md:col-span-2">
            <motion.button
              whileHover={{ scale: 1.02, translateY: -5 }}
              whileTap={{ scale: 0.98 }}
              disabled={isExpired}
              className={`w-full adventure-card p-6 md:p-10 flex flex-col items-center justify-center text-center group border-primary/30 bg-primary/5 hover:bg-primary/10 transition-all shadow-[0_0_50px_rgba(var(--primary-rgb),0.2)] ${isExpired ? 'opacity-40 grayscale pointer-events-none' : ''}`}
            >
              <div className="bg-primary/10 p-4 md:p-5 rounded-full mb-4 md:mb-6 group-hover:bg-primary/20 transition-colors border border-primary/20">
                <Camera className="w-10 h-10 md:w-12 md:h-12 text-primary torch-glow" />
              </div>
              <h3 className="font-adventure text-2xl md:text-3xl gold-engraving mb-2 tracking-widest">Mystical Lens</h3>
              <p className="text-[9px] md:text-[10px] uppercase font-adventure tracking-[0.3em] text-foreground/50 italic">Scan for Ancient Artifacts</p>
            </motion.button>
          </Link>

          {/* Navigation Grid */}
          <Link href="/captain/journal">
            <motion.button
              whileHover={{ scale: 1.05, translateY: -3 }}
              whileTap={{ scale: 0.95 }}
              className="w-full adventure-card p-6 flex flex-col items-center justify-center text-center gap-3 group border-primary/10 hover:border-primary/30 transition-all"
            >
              <div className="bg-primary/10 p-3 rounded-lg border border-primary/10 group-hover:bg-primary/20 transition-colors">
                <BookOpen className="w-6 h-6 text-primary" />
              </div>
              <span className="font-adventure text-[10px] uppercase tracking-[0.2em] text-primary/80">The Journal</span>
            </motion.button>
          </Link>

          <Link href="/captain/treasury">
            <motion.button
              whileHover={{ scale: 1.05, translateY: -3 }}
              whileTap={{ scale: 0.95 }}
              className="w-full adventure-card p-6 flex flex-col items-center justify-center text-center gap-3 group border-primary/10 hover:border-primary/30 transition-all"
            >
              <div className="bg-primary/10 p-3 rounded-lg border border-primary/10 group-hover:bg-primary/20 transition-colors">
                <Gem className="w-6 h-6 text-primary" />
              </div>
              <span className="font-adventure text-[10px] uppercase tracking-[0.2em] text-primary/80">The Treasury</span>
            </motion.button>
          </Link>

          <motion.button
            onClick={() => setShowQR(true)}
            whileHover={{ scale: 1.05, translateY: -3 }}
            whileTap={{ scale: 0.95 }}
            className="w-full adventure-card p-6 flex flex-col items-center justify-center text-center gap-3 group border-primary/10 hover:border-primary/30 transition-all"
          >
            <div className="bg-primary/10 p-3 rounded-lg border border-primary/10 group-hover:bg-primary/20 transition-colors">
              <QrCode className="w-6 h-6 text-primary" />
            </div>
            <span className="font-adventure text-[10px] uppercase tracking-[0.2em] text-primary/80">Team QR</span>
          </motion.button>

          <Link href="/leaderboard">
            <motion.button
              whileHover={{ scale: 1.05, translateY: -3 }}
              whileTap={{ scale: 0.95 }}
              className="w-full adventure-card p-6 flex flex-col items-center justify-center text-center gap-3 group border-primary/10 hover:border-primary/30 transition-all"
            >
              <div className="bg-primary/10 p-3 rounded-lg border border-primary/10 group-hover:bg-primary/20 transition-colors">
                <Compass className="w-6 h-6 text-primary" />
              </div>
              <span className="font-adventure text-[10px] uppercase tracking-[0.2em] text-primary/80">Rankings</span>
            </motion.button>
          </Link>

          <div className="md:col-span-2 mt-4">
            <div className="adventure-card p-6 bg-red-900/10 border-red-500/20 flex items-center gap-6">
              <div className="bg-red-500/20 p-3 rounded-full border border-red-500/30">
                <ShieldAlert className="w-6 h-6 text-red-500" />
              </div>
              <div>
                  <p className="text-[10px] uppercase font-adventure text-red-400 tracking-widest mb-1 italic">Mission Protocol</p>
                  <p className="text-xs text-[#f4e4bc]/60 font-content leading-relaxed">
                    Remember: Each activity registration is logged once per team. Public bounties are global, but secrets are hidden.
                  </p>
              </div>
            </div>
          </div>
        </div>

        {/* Map Panel */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="relative z-20 w-full max-w-2xl px-4 mt-8"
        >
          <MapPanel title="Expedition Map" subtitle="TSC Adventure Grounds" collapsible />
        </motion.div>

        <footer className="relative z-20 mt-12 mb-12 text-center">
          <button onClick={logout} className="text-[10px] uppercase font-adventure text-accent tracking-[0.3em] mb-8 hover:underline opacity-60">Abort Mission</button>
          <div className="flex items-center gap-4 mb-2 justify-center opacity-30">
            <span className="h-px w-16 bg-gradient-to-r from-transparent to-primary/40" />
            <span className="font-adventure text-[10px] tracking-[0.5em] uppercase">Control Link Established</span>
            <span className="h-px w-16 bg-gradient-to-l from-transparent to-primary/40" />
          </div>
        </footer>
      </div>
    </AuthGuard>
  );
}

function DifficultyBadge({ level }: { level: string }) {
  const colorClass = level === 'Easy' ? 'bg-green-600 text-white' : level === 'Hard' ? 'bg-red-600 text-white' : 'bg-amber-500 text-white';
  const flames = level === 'Easy' ? 1 : level === 'Hard' ? 3 : 2;
  
  return (
    <div className={`flex items-center gap-1.5 px-3 py-1 rounded-sm shadow-lg ${colorClass}`}>
      <div className="flex -space-x-0.5">
        {Array.from({ length: flames }).map((_, i) => (
          <Flame key={i} className="w-2.5 h-2.5 fill-current animate-pulse" />
        ))}
      </div>
      <span className="text-[9px] font-adventure uppercase tracking-widest">{level}</span>
    </div>
  );
}
