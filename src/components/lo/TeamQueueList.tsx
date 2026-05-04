'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Clock, CheckCircle2, Circle, Compass } from 'lucide-react';
import { supabase, fetchAllUsers } from '@/lib/supabase';

interface TeamQueueEntry {
  registration_id: string;
  team_id: string;
  team_name: string;
  created_at: string;
  has_score: boolean;
  participant_ids: string[];
}

interface TeamQueueListProps {
  activityId: string;
  /** Called when the list is refreshed — passes the current entries */
  onQueueLoaded?: (entries: TeamQueueEntry[]) => void;
  /** Refresh trigger: increment this value to force a re-fetch */
  refreshTrigger?: number;
  /** Currently selected team for score input */
  selectedTeamId?: string | null;
  onSelectTeam?: (teamId: string, teamName: string, participantIds: string[]) => void;
}

export default function TeamQueueList({
  activityId,
  onQueueLoaded,
  refreshTrigger = 0,
  selectedTeamId,
  onSelectTeam,
}: TeamQueueListProps) {
  const [entries, setEntries] = useState<TeamQueueEntry[]>([]);
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

  const fetchQueue = useCallback(async () => {
    setLoading(true);

    // Query activity_registrations joined with teams, then check score_logs for each team
    const { data: registrations, error: registrationsError } = await supabase
      .from('activity_registrations')
      .select(`
        id,
        team_id,
        checked_in_at,
        participant_ids,
        teams ( name )
      `)
      .eq('activity_id', activityId)
      .order('checked_in_at', { ascending: true });

    if (registrationsError || !registrations) {
      setLoading(false);
      return;
    }

    const queue: TeamQueueEntry[] = registrations.map((reg) => {
      // Supabase joins can return an array if the relationship is ambiguous to the generator
      const teamsData = Array.isArray(reg.teams) ? reg.teams[0] : reg.teams;
      
      return {
        registration_id: reg.id,
        team_id: reg.team_id,
        team_name: (teamsData as any)?.name ?? 'Unknown Team',
        created_at: reg.checked_in_at,
        has_score: false,
        participant_ids: Array.isArray(reg.participant_ids) ? reg.participant_ids : [],
      };
    });

    setEntries(queue);
    onQueueLoaded?.(queue);
    setLoading(false);
  }, [activityId, onQueueLoaded]);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue, refreshTrigger]);

  // Supabase Realtime: listen for new check-ins and new scores
  useEffect(() => {
    const channel = supabase
      .channel(`team-queue-${activityId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'activity_registrations', filter: `activity_id=eq.${activityId}` },
        () => { fetchQueue(); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'score_logs', filter: `activity_id=eq.${activityId}` },
        () => { fetchQueue(); }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activityId, fetchQueue]);

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className="adventure-card border-primary/20 bg-card/90 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-primary/20 bg-primary/5">
        <div className="flex items-center gap-3">
          <Users className="w-4 h-4 text-primary" />
          <h3 className="font-adventure text-xs md:text-sm uppercase tracking-[0.3em] text-primary">
            Team Queue
          </h3>
        </div>
        {!loading && (
          <span className="text-[9px] font-adventure text-primary/50 bg-primary/10 px-2 py-0.5 border border-primary/20 flex-shrink-0">
            {entries.length} TEAM{entries.length !== 1 ? 'S' : ''}
          </span>
        )}
      </div>

      {/* Column Headers */}
      <div className="grid grid-cols-12 gap-2 px-6 py-2 border-b border-primary/10 bg-black/20">
        <div className="col-span-5 font-adventure text-[8px] md:text-[9px] uppercase tracking-[0.3em] text-primary/40">
          Team
        </div>
        <div className="col-span-4 font-adventure text-[8px] md:text-[9px] uppercase tracking-[0.3em] text-primary/40 text-center">
          Check-in
        </div>
        <div className="col-span-3 font-adventure text-[8px] md:text-[9px] uppercase tracking-[0.3em] text-primary/40 text-right">
          Score
        </div>
      </div>

      {/* Rows */}
      <div className="divide-y divide-primary/10 max-h-[400px] overflow-y-auto">
        <AnimatePresence mode="popLayout">
          {loading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center p-16 opacity-40"
            >
              <Compass className="w-8 h-8 text-primary mb-3" />
              <p className="font-adventure text-xs tracking-widest italic">
                Scanning the field...
              </p>
            </motion.div>
          ) : entries.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center p-12 opacity-40 text-center"
            >
              <Users className="w-8 h-8 text-primary/40 mb-4" />
              <p className="font-adventure text-[10px] uppercase tracking-[0.2em] text-primary/60 italic leading-relaxed max-w-[200px]">
                No teams have checked in yet
              </p>
            </motion.div>
          ) : (
            entries.map((entry, idx) => {
              const isSelected = selectedTeamId === entry.team_id;
              return (
                <motion.button
                  key={entry.registration_id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.04 }}
                  onClick={() =>
                    !entry.has_score && onSelectTeam?.(entry.team_id, entry.team_name, entry.participant_ids)
                  }
                  disabled={entry.has_score}
                  className={`w-full grid grid-cols-12 gap-2 px-6 py-4 items-center text-left transition-all
                    ${entry.has_score
                      ? 'opacity-50 cursor-default'
                      : 'hover:bg-primary/5 cursor-pointer'
                    }
                    ${isSelected ? 'bg-primary/10 border-l-4 border-l-primary' : ''}
                  `}
                >
                  {/* Team name */}
                  <div className="col-span-5 flex flex-col gap-1 min-w-0">
                    <p
                      className={`font-adventure text-xs md:text-sm tracking-tight truncate transition-colors ${
                        isSelected ? 'text-primary' : 'text-foreground'
                      }`}
                    >
                      {entry.team_name}
                    </p>
                    {/* Participant Names */}
                    <div className="flex flex-wrap gap-1">
                      {entry.participant_ids.length > 0 ? (
                        entry.participant_ids.slice(0, 3).map(pid => (
                          <span key={pid} className="text-[8px] px-1.5 py-0.5 bg-primary/5 border border-primary/10 text-primary/70 rounded-sm truncate max-w-[60px]">
                            {userMap.get(pid) || '...'}
                          </span>
                        ))
                      ) : (
                        <span className="text-[8px] text-muted-foreground italic opacity-50">Pending</span>
                      )}
                      {entry.participant_ids.length > 3 && (
                        <span className="text-[8px] text-primary/40">+{entry.participant_ids.length - 3}</span>
                      )}
                    </div>
                  </div>

                  {/* Check-in time */}
                  <div className="col-span-4 flex items-center justify-center gap-1.5">
                    <Clock className="w-3 h-3 text-primary/40 flex-shrink-0" />
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {formatTime(entry.created_at)}
                    </span>
                  </div>

                  {/* Score status */}
                  <div className="col-span-3 flex justify-end">
                    {entry.has_score ? (
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                        <span className="text-[10px] font-adventure uppercase tracking-widest text-green-400">
                          Done
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <Circle className="w-4 h-4 text-primary/30" />
                        <span className="text-[10px] font-adventure uppercase tracking-widest text-primary/40">
                          Pending
                        </span>
                      </div>
                    )}
                  </div>
                </motion.button>
              );
            })
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
