'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { History, Clock, CheckCircle2, Compass, Award, Users } from 'lucide-react';
import { supabase, fetchAllUsers } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

interface HistoryEntry {
  id: string;
  team_name: string;
  points: number;
  created_at: string;
  participant_ids: string[];
}

interface TeamHistoryListProps {
  activityId: string;
  refreshTrigger?: number;
}

export default function TeamHistoryList({
  activityId,
  refreshTrigger = 0,
}: TeamHistoryListProps) {
  const { user } = useAuth();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [userMap, setUserMap] = useState<Map<string, string>>(new Map());

  // Fetch users for mapping names
  useEffect(() => {
    const fetchUserNames = async () => {
      const data = await fetchAllUsers('id, name');
      if (data) {
        setUserMap(new Map(data.map(u => [u.id, u.name])));
      }
    };
    fetchUserNames();
  }, []);

  const fetchHistory = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);

    const { data, error } = await supabase
      .from('score_logs')
      .select(`
        id,
        points_awarded,
        created_at,
        participant_ids,
        teams ( name )
      `)
      .eq('activity_id', activityId)
      .eq('lo_id', user.id) // Only show history for THIS LO
      .order('created_at', { ascending: false });

    if (error || !data) {
      setLoading(false);
      return;
    }

    const history: HistoryEntry[] = data.map((log) => ({
      id: log.id,
      team_name: (log.teams as any)?.name ?? 'Unknown Team',
      points: log.points_awarded,
      created_at: log.created_at,
      participant_ids: Array.isArray(log.participant_ids) ? log.participant_ids : [],
    }));

    setEntries(history);
    setLoading(false);
  }, [activityId, user?.id]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory, refreshTrigger]);

  // Supabase Realtime: listen for new scores
  useEffect(() => {
    const channel = supabase
      .channel(`history-${activityId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'score_logs', filter: `activity_id=eq.${activityId}` },
        () => { fetchHistory(); }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activityId, fetchHistory]);

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="adventure-card border-primary/20 bg-card/90 shadow-2xl">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-primary/20 bg-primary/5">
        <History className="w-4 h-4 text-primary" />
        <h3 className="font-adventure text-sm uppercase tracking-[0.3em] text-primary">
          Riwayat Penilaian
        </h3>
        {!loading && (
          <span className="ml-auto text-[10px] font-adventure text-primary/50 bg-primary/10 px-2 py-0.5 border border-primary/20">
            {entries.length} Selesai
          </span>
        )}
      </div>

      {/* Rows */}
      <div className="divide-y divide-primary/10 max-h-[60vh] overflow-y-auto custom-scrollbar" style={{ WebkitOverflowScrolling: 'touch' }}>
        <AnimatePresence mode="popLayout">
          {loading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center p-16 opacity-40"
            >
              <Compass className="w-8 h-8 text-primary mb-3 animate-spin-slow" />
              <p className="font-adventure text-xs tracking-widest italic">
                Membuka buku log...
              </p>
            </motion.div>
          ) : entries.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center p-16 opacity-40 text-center"
            >
              <History className="w-8 h-8 text-primary/40 mb-3" />
              <p className="font-adventure text-xs tracking-widest italic">
                Belum ada tim yang diselesaikan
              </p>
            </motion.div>
          ) : (
            entries.map((entry, idx) => (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.04 }}
                className="px-6 py-5 hover:bg-primary/[0.02] transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-full border border-primary/20">
                      <CheckCircle2 className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-adventure text-sm text-foreground tracking-wide">
                        {entry.team_name}
                      </h4>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Clock className="w-3 h-3 text-primary/40" />
                        <span className="text-[10px] text-muted-foreground uppercase tracking-widest">
                          Selesai jam {formatTime(entry.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-1.5 justify-end">
                      <Award className="w-4 h-4 text-primary" />
                      <span className="font-adventure text-lg text-primary torch-glow">
                        {entry.points}
                      </span>
                    </div>
                    <p className="text-[9px] uppercase font-adventure tracking-widest text-primary/40">
                      Poin Diberikan
                    </p>
                  </div>
                </div>

                {/* Participant Badges */}
                <div className="flex flex-wrap gap-1.5 ml-11">
                  <div className="flex items-center gap-1 mr-1">
                    <Users className="w-2.5 h-2.5 text-primary/30" />
                  </div>
                  {entry.participant_ids.map(pid => (
                    <span 
                      key={pid} 
                      className="text-[9px] px-2 py-0.5 bg-primary/5 border border-primary/10 text-primary/60 rounded-sm font-content"
                    >
                      {userMap.get(pid) || 'Unknown'}
                    </span>
                  ))}
                </div>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
