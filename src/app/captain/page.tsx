'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, BookOpen, ShieldAlert, QrCode, X, MapPin, Flame, Sword, Gem, Crown, LogOut } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '@/context/AuthContext';
import { useTimerContext } from '@/context/TimerContext';
import AuthGuard from '@/components/AuthGuard';
import MapPanel from '@/components/MapPanel';
import ExpeditionTimer from '@/components/ExpeditionTimer';
import Copyright from '@/components/Copyright';
import { supabase } from '@/lib/supabase';
import { generateUserBarcode } from '@/lib/auth';
import { useRef } from 'react';


export default function CaptainPortal() {
  const { logout, user } = useAuth();
  const { isExpired } = useTimerContext();
  const [showQR, setShowQR] = useState(false);
  const [discoveredActivity, setDiscoveredActivity] = useState<any>(null);
  const [discoveredHint, setDiscoveredHint] = useState<any>(null);

  const notifiedRegIds = useRef<Set<string>>(new Set());
  const notifiedHintIds = useRef<Set<string>>(new Set());
  const isInitialLoad = useRef(true);

  // Polling for discovery
  useEffect(() => {
    if (!user?.team_id) return;

    const fetchDiscovery = async () => {
      try {
        const res = await fetch(`/api/member/dashboard?teamId=${user.team_id}`);
        if (!res.ok) return;
        const data = await res.json();
        
        if (data && !data.error) {
          if (!isInitialLoad.current) {
            // Check for new registrations
            if (data.registrations) {
              data.registrations.forEach((reg: any) => {
                if (!notifiedRegIds.current.has(reg.activity_id)) {
                  notifiedRegIds.current.add(reg.activity_id);
                  const activity = data.activities?.find((a: any) => a.id === reg.activity_id);
                  if (activity) setDiscoveredActivity(activity);
                }
              });
            }
            // Check for new hints
            if (data.hints) {
              data.hints.forEach((hint: any) => {
                if (!notifiedHintIds.current.has(hint.id)) {
                  notifiedHintIds.current.add(hint.id);
                  if (hint.treasure_hunts) setDiscoveredHint(hint.treasure_hunts);
                }
              });
            }
          } else {
            // Initial load, just track existing IDs
            if (data.registrations) {
              data.registrations.forEach((r: any) => notifiedRegIds.current.add(r.activity_id));
            }
            if (data.hints) {
              data.hints.forEach((h: any) => notifiedHintIds.current.add(h.id));
            }
            isInitialLoad.current = false;
          }
        }
      } catch (e) {
        // Silent fail
      }
    };

    fetchDiscovery();
    const interval = setInterval(fetchDiscovery, 10000); // 10s polling

    return () => clearInterval(interval);
  }, [user?.team_id]);

  return (
    <AuthGuard allowedRoles={['admin', 'captain', 'vice_captain']}>
      <div className="fixed inset-0 flex flex-col bg-black font-content overflow-hidden">
        {/* Background */}
        <div
          className="fixed inset-0 z-0 bg-cover bg-center opacity-30"
          style={{ backgroundImage: 'url("/images/jungle_hq_bg.png")', filter: 'brightness(0.2)', transform: 'translateZ(0)' }}
        />
        <div className="fixed inset-0 z-10 jungle-overlay opacity-5 pointer-events-none" style={{ transform: 'translateZ(0)' }} />

        {/* Top Status Bar - Consistent with Member */}
        <div className="relative z-[40] bg-black/60 backdrop-blur-md border-b border-primary/20 px-4 py-2 flex justify-between items-center pr-12">
          <div className="flex items-center gap-3">
            <button
              onClick={logout}
              className="p-2 rounded-full hover:bg-red-500/10 text-red-500/60 transition-colors"
              title="Exit Portal"
            >
              <LogOut className="w-5 h-5 text-red-500/60" />
            </button>
            <div className="h-4 w-px bg-primary/10 mx-1" />
            <ExpeditionTimer variant="inline" />
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setShowQR(true)} className="bg-primary/20 border border-primary/30 px-2.5 py-1 rounded flex items-center gap-2 active:scale-95 transition-transform">
              <QrCode className="w-3 h-3 text-primary" />
              <span className="font-adventure text-[9px] text-primary pt-0.5 uppercase tracking-wider">QR</span>
            </button>
            <div className="w-4 h-8" />
          </div>
        </div>

        <div className="relative z-20 flex-1 overflow-y-auto pb-32 pt-8 px-4 space-y-8 custom-scrollbar">
          <header className="text-center max-w-lg mx-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-primary/20 p-3 rounded-full w-fit mx-auto mb-4 border border-primary/20"
            >
              <Sword className="text-primary w-8 h-8 torch-glow" />
            </motion.div>
            <h1 className="font-adventure text-4xl gold-engraving mb-2">Captain's Log</h1>
            <p className="text-muted-foreground italic text-[11px] opacity-70 px-4">
              "The path is treacherous, and the artifacts are well-hidden. Are you prepared to lead your team to victory?"
            </p>
          </header>

          <div className="grid grid-cols-1 gap-6 w-full max-w-md mx-auto">
            {/* Main Action: Scan */}
            <Link href="/captain/scan">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                disabled={isExpired}
                className={`w-full adventure-card p-8 flex flex-col items-center justify-center text-center group border-primary/30 bg-primary/5 hover:bg-primary/10 transition-all shadow-[0_0_50px_rgba(var(--primary-rgb),0.2)] ${isExpired ? 'opacity-40 grayscale pointer-events-none' : ''}`}
              >
                <div className="bg-primary/10 p-5 rounded-full mb-6 group-hover:bg-primary/20 transition-colors border border-primary/20">
                  <Camera className="w-10 h-10 text-primary torch-glow" />
                </div>
                <h3 className="font-adventure text-2xl gold-engraving mb-1 tracking-widest">Mystical Lens</h3>
                <p className="text-[10px] uppercase font-adventure tracking-[0.3em] text-foreground/50 italic">Scan for Ancient Artifacts</p>
              </motion.button>
            </Link>

            {/* Navigation Grid */}
            <div className="grid grid-cols-2 gap-4">
              <Link href="/captain/journal">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="w-full adventure-card p-5 flex flex-col items-center justify-center text-center gap-2 group border-primary/10 hover:border-primary/30 transition-all"
                >
                  <div className="bg-primary/10 p-2.5 rounded-lg border border-primary/10 group-hover:bg-primary/20 transition-colors">
                    <BookOpen className="w-5 h-5 text-primary" />
                  </div>
                  <span className="font-adventure text-[9px] uppercase tracking-[0.2em] text-primary/80">The Journal</span>
                </motion.button>
              </Link>

              <Link href="/captain/treasury">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="w-full adventure-card p-5 flex flex-col items-center justify-center text-center gap-2 group border-primary/10 hover:border-primary/30 transition-all"
                >
                  <div className="bg-primary/10 p-2.5 rounded-lg border border-primary/10 group-hover:bg-primary/20 transition-colors">
                    <Gem className="w-5 h-5 text-primary" />
                  </div>
                  <span className="font-adventure text-[9px] uppercase tracking-[0.2em] text-primary/80">The Treasury</span>
                </motion.button>
              </Link>

              <Link href="/leaderboard" className="col-span-2">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full adventure-card p-4 flex items-center justify-center gap-4 group border-primary/10 hover:border-primary/30 transition-all"
                >
                  <div className="bg-primary/10 p-2 rounded-lg border border-primary/10 group-hover:bg-primary/20 transition-colors">
                    <Crown className="w-4 h-4 text-primary" />
                  </div>
                  <span className="font-adventure text-[10px] uppercase tracking-[0.3em] text-primary/80">Global Rankings</span>
                </motion.button>
              </Link>
            </div>

            <div className="mt-2">
              <div className="adventure-card p-5 bg-red-900/10 border-red-500/20 flex items-center gap-4">
                <div className="bg-red-500/20 p-2 rounded-full border border-red-500/30 shrink-0">
                  <ShieldAlert className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <p className="text-[9px] uppercase font-adventure text-red-400 tracking-widest mb-1 italic pt-1">Mission Protocol</p>
                  <p className="text-[11px] text-[#f4e4bc]/60 font-content leading-relaxed">
                    Each registration is logged once per team. Public bounties are global, secrets are hidden.
                  </p>
                </div>
              </div>
            </div>

            <MapPanel title="Expedition Map" subtitle="TSC Adventure Grounds" collapsible />

            <Copyright />
          </div>
        </div>

        {/* Discovery Modals */}
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
                </div>
                <div className="p-6 bg-primary/5 border-t border-primary/10">
                  <button onClick={() => setDiscoveredHint(null)} className="w-full py-4 font-adventure text-sm uppercase tracking-[0.4em] bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-[0_10px_20px_rgba(0,0,0,0.4)] active:scale-95">Secure Discovery</button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

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
                </div>
                <div className="p-8 text-center space-y-6">
                  <div className="space-y-2">
                    <p className="text-[10px] uppercase font-adventure text-primary tracking-[0.4em] opacity-60">Discovery Unlocked</p>
                    <p className="text-sm font-content text-foreground/80 italic leading-relaxed">
                      "{discoveredActivity.description || 'A new path has been revealed.'}"
                    </p>
                  </div>
                </div>
                <div className="p-6 bg-primary/5 border-t border-primary/10">
                  <button onClick={() => setDiscoveredActivity(null)} className="w-full py-4 font-adventure text-sm uppercase tracking-[0.4em] bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-[0_10px_20px_rgba(0,0,0,0.4)] active:scale-95">Accept Mission</button>
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
                <div className="relative z-10">
                  <h2 className="font-adventure text-3xl gold-engraving mb-1">{user.name}</h2>
                  <p className="text-[11px] uppercase tracking-widest text-primary/70 mb-6 font-adventure flex items-center justify-center gap-2">
                    <Crown className="w-3 h-3 text-primary" />
                    Captain • FIF Expedition
                  </p>
                  <div className="bg-white/95 p-5 rounded-xl inline-block mb-6 border border-primary/20 relative">
                    <QRCodeSVG
                      value={user?.id ? generateUserBarcode(user.id) : ''}
                      size={180}
                      level="M"
                      includeMargin={false}
                    />
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
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
