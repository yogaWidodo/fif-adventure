'use client';

import { useEffect } from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, BookOpen, Compass, ShieldAlert, Skull, QrCode, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '@/context/AuthContext';
import { useTimerContext } from '@/context/TimerContext';
import AuthGuard from '@/components/AuthGuard';
import MapPanel from '@/components/MapPanel';
import { generateTeamBarcode } from '@/lib/auth';

export default function CaptainPortal() {
  const { logout, user } = useAuth();
  const { isExpired } = useTimerContext();
  const [expeditionOver, setExpeditionOver] = useState(false);
  const [showQR, setShowQR] = useState(false);

  // Sync expeditionOver with timer context
  useEffect(() => {
    if (isExpired) setExpeditionOver(true);
  }, [isExpired]);

  return (
    <AuthGuard allowedRoles={['admin', 'kaptain', 'cocaptain']}>
      <div className="relative min-h-screen flex flex-col items-center justify-center p-6 bg-black overflow-hidden font-content">
        {/* Background */}
        <div 
          className="fixed inset-0 z-0 bg-cover bg-center opacity-30"
          style={{ backgroundImage: 'url("/images/jungle_hq_bg.png")', filter: 'brightness(0.2)' }}
        />
        <div className="fixed inset-0 z-10 jungle-overlay opacity-5 pointer-events-none" />

        {/* QR Code Modal */}
        <AnimatePresence>
          {showQR && user?.team_id && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[95] bg-black/80 backdrop-blur-md flex items-center justify-center p-6"
              onClick={() => setShowQR(false)}
            >
              <motion.div
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.85, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                className="adventure-card p-8 max-w-sm w-full text-center border-primary/30"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => setShowQR(false)}
                  className="absolute top-4 right-4 text-foreground/40 hover:text-foreground transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
                <p className="text-[10px] uppercase font-adventure tracking-widest text-primary opacity-60 mb-2">Team QR Code</p>
                <h2 className="font-adventure text-2xl gold-engraving mb-6">{user.nama}</h2>
                <div className="bg-white p-4 rounded-lg inline-block mb-6">
                  <QRCodeSVG
                    value={generateTeamBarcode(user.team_id)}
                    size={200}
                    level="M"
                    includeMargin={false}
                  />
                </div>
                <p className="text-xs text-foreground/40 italic font-content">
                  Show this to the Location Officer to check in your team.
                </p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Expedition Over Overlay */}
        <AnimatePresence>
          {expeditionOver && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-md flex flex-col items-center justify-center text-center p-8"
            >
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="adventure-card p-12 max-w-md border-gray-500/30"
              >
                <div className="bg-gray-800/60 p-5 rounded-full w-fit mx-auto mb-6 border border-gray-600/30">
                  <Skull className="text-gray-400 w-12 h-12" />
                </div>
                <h2 className="font-adventure text-4xl text-gray-300 mb-4">Expedition Over</h2>
                <p className="text-muted-foreground italic text-sm mb-8 opacity-70">
                  "The sands of time have run out. Your expedition has come to an end."
                </p>
                <Link href="/leaderboard">
                  <button className="w-full bg-primary/20 hover:bg-primary/30 border border-primary/40 text-primary font-adventure uppercase tracking-widest py-4 transition-all">
                    View Final Rankings
                  </button>
                </Link>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <header className="relative z-20 mb-12 text-center max-w-lg">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-primary/20 p-5 rounded-full w-fit mx-auto mb-6 border border-primary/20 backdrop-blur-md"
          >
            <Compass className="text-primary w-12 h-12 torch-glow" />
          </motion.div>
          <h1 className="font-adventure text-5xl md:text-6xl gold-engraving mb-4">Captain's Log</h1>
          <p className="text-muted-foreground italic text-sm opacity-70">
            "The path is treacherous, and the artifacts are well-hidden. Are you prepared to lead your team to victory?"
          </p>
        </header>

        <div className="relative z-20 grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl px-6">
          {/* Scan button — disabled when expedition is over */}
          {expeditionOver ? (
            <div className="w-full adventure-card p-10 flex flex-col items-center justify-center text-center border-gray-700/20 opacity-40 cursor-not-allowed">
              <div className="bg-gray-800/20 p-4 rounded-lg mb-6">
                <Camera className="w-10 h-10 text-gray-600" />
              </div>
              <h3 className="font-adventure text-2xl text-gray-600 mb-2">Mystical Lens</h3>
              <p className="text-[10px] uppercase font-adventure tracking-widest text-foreground/20 italic">Scanning Disabled</p>
            </div>
          ) : (
            <Link href="/captain/scan">
              <motion.button
                whileHover={{ scale: 1.05, translateY: -5 }}
                whileTap={{ scale: 0.95 }}
                className="w-full adventure-card p-10 flex flex-col items-center justify-center text-center group border-primary/20 hover:border-primary transition-all shadow-[0_0_40px_rgba(0,0,0,0.5)]"
              >
                <div className="bg-primary/10 p-4 rounded-lg mb-6 group-hover:bg-primary/20 transition-colors">
                  <Camera className="w-10 h-10 text-primary torch-glow" />
                </div>
                <h3 className="font-adventure text-2xl gold-engraving mb-2">Mystical Lens</h3>
                <p className="text-[10px] uppercase font-adventure tracking-widest text-foreground/40 italic">Scan for Ancient Artifacts</p>
              </motion.button>
            </Link>
          )}

          <Link href="/leaderboard">
            <motion.button
              whileHover={{ scale: 1.05, translateY: -5 }}
              whileTap={{ scale: 0.95 }}
              className="w-full adventure-card p-10 flex flex-col items-center justify-center text-center group border-primary/20 hover:border-primary transition-all shadow-[0_0_40px_rgba(0,0,0,0.5)]"
            >
              <div className="bg-primary/10 p-4 rounded-lg mb-6 group-hover:bg-primary/20 transition-colors">
                <BookOpen className="w-10 h-10 text-primary" />
              </div>
              <h3 className="font-adventure text-2xl gold-engraving mb-2">Hall of Records</h3>
              <p className="text-[10px] uppercase font-adventure tracking-widest text-foreground/40 italic">Check Global Rankings</p>
            </motion.button>
          </Link>

          {/* Show Team QR Code */}
          {user?.team_id && (
            <motion.button
              whileHover={{ scale: 1.05, translateY: -5 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowQR(true)}
              className="w-full adventure-card p-10 flex flex-col items-center justify-center text-center group border-primary/20 hover:border-primary transition-all shadow-[0_0_40px_rgba(0,0,0,0.5)]"
            >
              <div className="bg-primary/10 p-4 rounded-lg mb-6 group-hover:bg-primary/20 transition-colors">
                <QrCode className="w-10 h-10 text-primary torch-glow" />
              </div>
              <h3 className="font-adventure text-2xl gold-engraving mb-2">Team Badge</h3>
              <p className="text-[10px] uppercase font-adventure tracking-widest text-foreground/40 italic">Show QR to Location Officer</p>
            </motion.button>
          )}

          <div className="col-span-full mt-6">
            <div className="adventure-card p-6 bg-red-900/10 border-red-500/20 flex items-center gap-6 backdrop-blur-sm">
              <div className="bg-red-500/20 p-3 rounded-full border border-red-500/30">
                <ShieldAlert className="w-6 h-6 text-red-500" />
              </div>
              <div>
                <p className="text-[10px] uppercase font-adventure text-red-400 tracking-widest mb-1 italic">Mission Protocol</p>
                <p className="text-xs text-[#f4e4bc]/60 font-content leading-relaxed">
                  Remember: Each artifact can only be claimed once per expedition. Ensure your device is calibrated for low-light scans.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Map Panel */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.5 }}
          className="relative z-20 w-full max-w-2xl px-6 mt-8"
        >
          <MapPanel title="Expedition Map" subtitle="TSC Adventure Grounds" collapsible />
        </motion.div>

        <footer className="relative z-20 mt-10 text-center">
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
