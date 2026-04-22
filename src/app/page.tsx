'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Compass, Map as MapIcon, ShieldCheck, UserCircle, LogOut } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { getRoleRedirect } from '@/lib/auth';
import MapPanel from '@/components/MapPanel';

export default function Home() {
  const { userRole, logout } = useAuth();

  const getDashboardLink = () => {
    if (!userRole) return '/login';
    return getRoleRedirect(userRole);
  };

  return (
    <div className="fixed inset-0 overflow-y-auto overflow-x-hidden flex flex-col items-center justify-center bg-black selection:bg-primary selection:text-primary-foreground">
      {/* Background Image with Overlay */}
      <div
        className="absolute inset-0 z-0 bg-cover bg-center"
        style={{
          backgroundImage: 'url("/images/expedition_map_bg.png")',
          filter: 'brightness(0.3) contrast(1.2)'
        }}
      />

      {/* Jungle Fog Overlay */}
      <div className="absolute inset-0 z-10 jungle-overlay opacity-20 pointer-events-none" />

      {/* Main Content */}
      <main className="relative z-20 flex flex-col items-center text-center px-6 max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="mb-8"
        >
          <div className="inline-flex items-center justify-center p-4 mb-6 rounded-full bg-primary/10 border border-primary/20">
            <Compass className="w-12 h-12 text-primary torch-glow" />
          </div>
          <h1 className="text-5xl md:text-7xl font-adventure mb-4 tracking-[0.2em] gold-engraving uppercase">
            FIF <br /> Adventure
          </h1>
          <p className="text-lg md:text-xl text-foreground/70 font-content italic tracking-wide max-w-2xl mx-auto">
            "Work together and fun together"
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5, duration: 0.5 }}
          className="flex flex-col sm:flex-row gap-6 mt-12 bg-black/60 p-8 border border-white/5 rounded-none"
        >
          {!userRole ? (
            <Link href="/login">
              <button className="group relative px-10 py-5 bg-primary text-primary-foreground rounded-none font-adventure text-lg tracking-widest overflow-hidden transition-all hover:bg-primary/90 hover:scale-105 active:scale-95 shadow-[0_0_30px_rgba(212,175,55,0.3)]">
                <span className="relative z-10 flex items-center gap-3">
                  <UserCircle className="w-6 h-6" />
                  Declare Identity
                </span>
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
              </button>
            </Link>
          ) : (
            <Link href={getDashboardLink()}>
              <button className="group relative px-10 py-5 bg-primary text-primary-foreground rounded-none font-adventure text-lg tracking-widest overflow-hidden transition-all hover:bg-primary/90 hover:scale-105 active:scale-95 shadow-[0_0_30px_rgba(212,175,55,0.3)]">
                <span className="relative z-10 flex items-center gap-3">
                  <ShieldCheck className="w-6 h-6" />
                  Access HQ
                   ({userRole})
                </span>
              </button>
            </Link>
          )}

          <Link href="/leaderboard">
            <button className="px-10 py-5 border-2 border-primary/40 text-primary rounded-none font-adventure text-lg tracking-widest transition-all hover:border-primary hover:bg-primary/10 hover:text-white uppercase group">
              <span className="flex items-center gap-3">
                <MapIcon className="w-6 h-6 group-hover:rotate-12 transition-transform" />
                Hall Of Records              
                </span>
            </button>
          </Link>
        </motion.div>

        {/* Map Panel — visible to all users */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 0.5 }}
          className="relative z-20 w-full max-w-3xl mt-10 px-4"
        >
          <MapPanel title="Expedition Map" subtitle="TSC Adventure Grounds" collapsible />
        </motion.div>

        {userRole && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.6 }}
            whileHover={{ opacity: 1 }}
            onClick={logout}
            className="mt-8 flex items-center gap-2 text-[10px] uppercase font-adventure tracking-widest text-[#f4e4bc] border-b border-transparent hover:border-primary transition-all"
          >
            <LogOut className="w-3 h-3" />
            End Expedition Session
          </motion.button>
        )}
      </main>

      {/* Decorative Corners */}
      <div className="absolute top-8 left-8 w-16 h-16 border-t-2 border-l-2 border-primary/30 pointer-events-none" />
      <div className="absolute top-8 right-8 w-16 h-16 border-t-2 border-r-2 border-primary/30 pointer-events-none" />
      <div className="absolute bottom-8 left-8 w-16 h-16 border-b-2 border-l-2 border-primary/30 pointer-events-none" />
      <div className="absolute bottom-8 right-8 w-16 h-16 border-b-2 border-r-2 border-primary/30 pointer-events-none" />
    </div>
  );
}
