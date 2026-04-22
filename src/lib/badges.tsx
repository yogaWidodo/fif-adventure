import { Trophy, Compass, CheckCircle2, Shield } from 'lucide-react';
import React from 'react';

export interface ScoreLog {
  id: string;
  activity_id: string;
  points_awarded: number;
  created_at: string;
  participant_ids: string[] | null;
  activities?: { name: string } | null;
}

export interface BadgeInfo {
  id: string;
  name: string;
  icon: React.ReactNode;
  description: string;
}

export function calculateBadges(
  userId: string,
  teamScoreLogs: ScoreLog[],
  teamTotalPoints: number
): BadgeInfo[] {
  const myScoreLogs = teamScoreLogs.filter(
    log => log.participant_ids && log.participant_ids.includes(userId)
  );

  const myTotalContribution = myScoreLogs.reduce((sum, log) => {
    const pointsPerPerson = log.participant_ids && log.participant_ids.length > 0 
      ? log.points_awarded / log.participant_ids.length 
      : 0;
    return sum + pointsPerPerson;
  }, 0);
  
  const contributionPercentage = teamTotalPoints > 0
    ? Math.round((myTotalContribution / teamTotalPoints) * 100)
    : 0;

  const badges: BadgeInfo[] = [];

  const memberPoints: Record<string, number> = {};
  teamScoreLogs.forEach(log => {
    if (log.participant_ids && log.participant_ids.length > 0) {
      const pts = log.points_awarded / log.participant_ids.length;
      log.participant_ids.forEach(id => {
        memberPoints[id] = (memberPoints[id] || 0) + pts;
      });
    }
  });

  let mvpId: string | null = null;
  let maxPts = 0;
  Object.entries(memberPoints).forEach(([id, pts]) => {
    if (pts > maxPts) {
      maxPts = pts;
      mvpId = id;
    }
  });

  if (mvpId === userId && myTotalContribution > 0) {
    badges.push({
      id: 'mvp',
      name: 'Team MVP',
      icon: <Trophy className="w-4 h-4 text-yellow-400" />,
      description: 'Menyumbang poin terbanyak di tim saat ini!'
    });
  }

  if (myScoreLogs.length >= 5) {
    badges.push({
      id: 'explorer',
      name: 'Si Paling Aktif',
      icon: <Compass className="w-4 h-4 text-blue-400" />,
      description: 'Berpartisipasi di lebih dari 5 wahana.'
    });
  } else if (myScoreLogs.length >= 1) {
    badges.push({
      id: 'first_blood',
      name: 'Pioneer',
      icon: <CheckCircle2 className="w-4 h-4 text-green-400" />,
      description: 'Telah memulai perjalanan ekspedisi.'
    });
  }

  if (contributionPercentage >= 40 && teamTotalPoints > 20) {
    badges.push({
      id: 'hero',
      name: 'Pahlawan Tim',
      icon: <Shield className="w-4 h-4 text-red-400" />,
      description: `Tulang punggung tim! Menyumbang ${contributionPercentage}% dari total poin.`
    });
  }

  return badges;
}
