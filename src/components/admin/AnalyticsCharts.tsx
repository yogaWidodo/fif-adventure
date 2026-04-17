'use client';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line,
} from 'recharts';

const tooltipStyle = {
  backgroundColor: '#0a1a0f',
  border: '1px solid rgba(212,175,55,0.3)',
  borderRadius: '2px',
  color: '#f4e4bc',
  fontSize: '11px',
  fontFamily: 'var(--font-content, sans-serif)',
};

interface TopTeam { name: string; total_points: number }
interface WahanaItem { name: string; checkins: number; scored: number }
interface TimelineItem { hour: string; scans: number }

export function TopTeamsChart({ data }: { data: TopTeam[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 40 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(212,175,55,0.1)" />
        <XAxis dataKey="name" tick={{ fill: 'rgba(244,228,188,0.5)', fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
        <YAxis tick={{ fill: 'rgba(244,228,188,0.4)', fontSize: 10 }} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(212,175,55,0.05)' }} />
        <Bar dataKey="total_points" name="Points" fill="rgba(212,175,55,0.7)" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function WahanaActivityChart({ data }: { data: WahanaItem[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 40 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(212,175,55,0.1)" />
        <XAxis dataKey="name" tick={{ fill: 'rgba(244,228,188,0.5)', fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
        <YAxis tick={{ fill: 'rgba(244,228,188,0.4)', fontSize: 10 }} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(212,175,55,0.05)' }} />
        <Bar dataKey="checkins" name="Check-ins" fill="rgba(212,175,55,0.6)" radius={[2, 2, 0, 0]} />
        <Bar dataKey="scored" name="Scored" fill="rgba(74,222,128,0.5)" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ScanTimelineChart({ data }: { data: TimelineItem[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(212,175,55,0.1)" />
        <XAxis dataKey="hour" tick={{ fill: 'rgba(244,228,188,0.5)', fontSize: 10 }} />
        <YAxis tick={{ fill: 'rgba(244,228,188,0.4)', fontSize: 10 }} />
        <Tooltip contentStyle={tooltipStyle} />
        <Line type="monotone" dataKey="scans" name="Scans" stroke="rgba(212,175,55,0.8)" strokeWidth={2} dot={{ fill: 'rgba(212,175,55,0.8)', r: 3 }} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
