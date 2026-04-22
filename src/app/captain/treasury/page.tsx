'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { motion } from 'framer-motion';
import { Gem, ScrollText, Trophy, Lock, Compass, Map, CheckCircle2, Flame, ArrowLeft } from 'lucide-react';
import AuthGuard from '@/components/AuthGuard';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';

export default function TreasuryMenu() {
  const { user } = useAuth();
  const [publicTreasures, setPublicTreasures] = useState<any[]>([]);
  const [claims, setClaims] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.team_id) fetchTreasuryData(user.team_id);
  }, [user]);

  const fetchTreasuryData = async (teamId: string) => {
    setLoading(true);
    const [treasuresRes, claimRes] = await Promise.all([
      supabase.from('treasure_hunts').select('*').eq('is_public', true).order('name'),
      supabase.from('treasure_hunt_claims').select('*').eq('team_id', teamId),
    ]);

    setPublicTreasures(treasuresRes.data || []);
    setClaims(claimRes.data || []);
    setLoading(false);
  };

  const isClaimed = (id: string) => claims.some(c => c.treasure_hunt_id === id);

  return (
    <AuthGuard allowedRoles={['captain', 'vice_captain', 'member']}>
      <div className="relative min-h-screen flex flex-col bg-black overflow-hidden font-content p-6 pb-24">
        {/* Background */}
        <div 
          className="fixed inset-0 z-0 bg-cover bg-center opacity-30"
          style={{ backgroundImage: 'url("/images/jungle_hq_bg.png")', filter: 'brightness(0.3)' }}
        />
        <div className="fixed inset-0 z-10 bg-gradient-to-b from-black/80 via-transparent to-black" />

        <div className="relative z-20 w-full max-w-4xl mx-auto">
          <header className="mb-12">
            <Link href="/captain" className="inline-flex items-center gap-2 text-[10px] uppercase font-adventure tracking-[0.3em] text-primary/60 hover:text-primary transition-colors mb-8">
              <ArrowLeft className="w-3 h-3" />
              Back to Deck
            </Link>
            
            <div className="flex items-center gap-4 mb-3">
              <span className="h-px w-12 bg-primary/40" />
              <p className="text-[10px] uppercase tracking-[0.4em] text-primary font-adventure">The Treasury</p>
            </div>
            <h1 className="font-adventure text-5xl gold-engraving mb-4">Bounty Records</h1>
            <p className="text-muted-foreground italic text-sm max-w-lg leading-relaxed opacity-70">
              "Public rumors and documented treasures known across the archipelago. Secure them before others do."
            </p>
          </header>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 opacity-30 italic">
              <Compass className="w-12 h-12 animate-spin-slow mb-4 text-primary" />
              Consulting the bounty boards...
            </div>
          ) : publicTreasures.length === 0 ? (
            <div className="adventure-card p-20 text-center opacity-40">
              <Lock className="w-10 h-10 mx-auto mb-4 text-primary/40" />
              <p className="font-adventure text-lg uppercase tracking-widest">No Public Bounties Found</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {publicTreasures.map((treasure, idx) => {
                const claimed = isClaimed(treasure.id);
                return (
                  <motion.div
                    key={treasure.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className={`parchment p-8 border-l-[8px] flex flex-col justify-between transition-all relative overflow-hidden ${
                      claimed ? 'border-l-green-600 opacity-100' : 'border-l-primary opacity-90'
                    }`}
                  >
                    <div>
                      <div className="flex justify-between items-start mb-6">
                        <div className={`p-3 rounded-lg border ${claimed ? 'bg-green-100 border-green-200' : 'bg-primary/10 border-primary/20'}`}>
                          <Gem className={`w-6 h-6 ${claimed ? 'text-green-600' : 'text-primary'}`} />
                        </div>
                        <div className="text-right">
                          <p className={`text-2xl font-adventure ${claimed ? 'text-green-700' : 'text-primary'}`}>{treasure.points} PTS</p>
                          <p className="text-[8px] uppercase font-adventure opacity-40 tracking-widest">Prestige Bounty</p>
                        </div>
                      </div>

                      <h3 className="font-adventure text-xl text-[#2b1d0e] mb-2 uppercase tracking-tight">{treasure.name}</h3>
                      
                      <div className="bg-[#2b1d0e]/5 border border-[#8b4513]/10 p-4 rounded-sm mb-6">
                        <div className="flex gap-2 items-start">
                          <ScrollText className="w-4 h-4 text-[#8b4513]/60 flex-shrink-0 mt-0.5" />
                          <p className="text-sm text-[#2b1d0e]/80 font-content italic leading-relaxed">
                            "{treasure.hint_text}"
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t border-[#8b4513]/10">
                      <div className="flex items-center gap-2">
                        <span className={`text-[9px] font-adventure uppercase tracking-widest px-2 py-0.5 rounded-sm ${claimed ? 'bg-green-600 text-white' : 'bg-primary/20 text-[#8b4513]'}`}>
                          {claimed ? 'Secured' : 'Active Bounty'}
                        </span>
                        {!claimed && (
                          <span className="text-[9px] font-adventure text-[#8b4513]/40 uppercase tracking-widest">
                            {treasure.remaining_quota} left
                          </span>
                        )}
                      </div>
                      {claimed && <CheckCircle2 className="w-5 h-5 text-green-600" />}
                    </div>
                    
                    {claimed && (
                      <div className="absolute top-0 right-0 overflow-hidden w-20 h-20 pointer-events-none">
                        <div className="absolute top-2 right-[-24px] rotate-45 bg-green-600 text-white text-[8px] font-adventure py-1 px-8 shadow-lg">
                          SECURED
                        </div>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AuthGuard>
  );
}
