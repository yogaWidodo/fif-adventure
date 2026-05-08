'use client';

/**
 * ScanModal — modal scan QR code tim untuk LO.
 *
 * Flow baru:
 * 1. Kamera aktif → scan QR → kamera STOP setelah berhasil decode
 * 2. Muncul pilihan: Check In atau Give Point
 * 3. LO pilih → eksekusi → modal tutup otomatis jika berhasil
 */

import { useEffect, useRef, useCallback, useId, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  X,
  Camera,
  CameraOff,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  LogIn,
  Star,
  Gem,
  Skull,
  Users,
  CheckSquare,
  Square
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { isTeamBarcode, isUserBarcode } from '@/lib/auth';

// Helper: get current access token from Supabase session or localStorage
async function getAccessToken(): Promise<string | null> {
  // 1. Try Supabase session first
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) return session.access_token;

  // 2. Fallback: localStorage (set during login)
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('fif_access_token');
    if (stored) return stored;
  }

  return null;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScanModalProps {
  isOpen: boolean;
  activityId: string;
  activityName: string;
  activityType: string;
  activityPoints: number;
  onClose: () => void;
  onCheckinSuccess: (teamName: string, hintGranted?: boolean) => void;
  onScoringSuccess: (teamName: string, score: number) => void;
  preSelectedTeam?: { id: string, name: string, participantIds: string[] } | null;
}

type Phase =
  | 'scanning'                  // kamera aktif, menunggu scan
  | 'choosing'                  // QR berhasil di-scan, pilih aksi
  | 'giving_point'              // input jumlah anggota yang berpartisipasi
  | 'submitting'                // sedang kirim ke API
  | 'error'                     // error, bisa retry
  | 'success';                  // berhasil, modal akan tutup

interface TeamInfo {
  id: string;
  name: string;
  barcodeData: string;
}

interface TeamMember {
  id: string;
  name: string;
  role: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ScanModal({
  isOpen,
  activityId,
  activityName: _activityName,
  activityType,
  activityPoints,
  onClose,
  onCheckinSuccess,
  onScoringSuccess,
  preSelectedTeam = null,
}: ScanModalProps) {
  const reactId = useId();
  const scannerId = `qr-scanner-${reactId.replace(/:/g, '')}`;

  const [phase, setPhase] = useState<Phase>('scanning');
  const [team, setTeam] = useState<TeamInfo | null>(null);
  const [scannedUser, setScannedUser] = useState<TeamMember | null>(null); // Option 1
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [confirmedMemberIds, setConfirmedMemberIds] = useState<string[]>([]); // For scoring phase
  const [errorMsg, setErrorMsg] = useState('');
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Initialize if preSelectedTeam is provided (Scoring Mode)
  useEffect(() => {
    if (preSelectedTeam && isOpen) {
      setTeam({ id: preSelectedTeam.id, name: preSelectedTeam.name, barcodeData: '' });
      setSelectedMemberIds(preSelectedTeam.participantIds);
      setConfirmedMemberIds([]);
      setPhase('giving_point');
    }
  }, [preSelectedTeam, isOpen]);

  const scannerRef = useRef<import('html5-qrcode').Html5Qrcode | null>(null);
  const isScanningRef = useRef(false);
  const processingRef = useRef(false);
  const isSubmittingRef = useRef(false); // Debounce guard for check-in & scoring

  // ── Camera ──────────────────────────────────────────────────────────────────

  const stopCamera = useCallback(async () => {
    if (!scannerRef.current) return;
    try {
      if (isScanningRef.current) {
        await scannerRef.current.stop();
        isScanningRef.current = false;
      }
      scannerRef.current.clear();
    } catch {
      // ignore — camera may already be stopped
    }
    scannerRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    const { Html5Qrcode } = await import('html5-qrcode');
    const scanner = new Html5Qrcode(scannerId);
    scannerRef.current = scanner;

    try {
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 },
        (decodedText) => {
          if (!processingRef.current) {
            processingRef.current = true;
            handleQRCodeScanned(decodedText);
          }
        },
        () => { /* scan failure per frame — ignored */ }
      );
      isScanningRef.current = true;
      setCameraError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const lower = msg.toLowerCase();
      if (lower.includes('permission') || lower.includes('denied') || lower.includes('notallowed')) {
        setCameraError('Akses kamera ditolak. Izinkan akses kamera di pengaturan browser, lalu muat ulang halaman.');
      } else if (lower.includes('notfound') || lower.includes('no camera') || lower.includes('devicenotfound')) {
        setCameraError('Kamera tidak ditemukan. Pastikan perangkat Anda memiliki kamera.');
      } else {
        setCameraError('Kamera tidak dapat diakses. Periksa pengaturan browser Anda.');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scannerId]);

  // ── Modal lifecycle ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setPhase('scanning');
      setTeam(null);
      setScannedUser(null);
      setErrorMsg('');
      setCameraError(null);
      processingRef.current = false;
      return;
    }

    // Only start camera if we are in scanning phase
    if (phase === 'scanning') {
      const timer = setTimeout(() => startCamera(), 150);
      return () => clearTimeout(timer);
    } else {
      stopCamera();
    }
  }, [isOpen, phase, startCamera, stopCamera]);

  useEffect(() => () => { stopCamera(); }, [stopCamera]);

  // ── QR scan handler ─────────────────────────────────────────────────────────

  const handleQRCodeScanned = useCallback(async (rawValue: string) => {
    // Stop camera immediately after successful decode
    await stopCamera();

    const { extractTeamIdFromBarcode, extractUserIdFromBarcode } = await import('@/lib/auth');

    // Case A: Team Barcode (Backward compatibility or fallback)
    if (isTeamBarcode(rawValue)) {
      const extractedTeamId = extractTeamIdFromBarcode(rawValue);
      if (!extractedTeamId) {
        setErrorMsg('Gagal mengekstrak ID tim.');
        setPhase('error');
        processingRef.current = false;
        return;
      }

      const { data: teamRecord } = await supabase.from('teams').select('id, name').eq('id', extractedTeamId).maybeSingle();
      if (!teamRecord) {
        setErrorMsg('Tim tidak ditemukan.');
        setPhase('error');
        processingRef.current = false;
        return;
      }

      const { data: membersRecord } = await supabase.from('users').select('id, name, role').eq('team_id', extractedTeamId).in('role', ['captain', 'vice_captain', 'member']);

      setTeam({ id: teamRecord.id, name: teamRecord.name, barcodeData: rawValue });
      setTeamMembers(membersRecord ?? []);
      setScannedUser(null);
      setPhase('choosing');
    }
    // Case B: User Barcode
    else if (isUserBarcode(rawValue)) {
      const extractedUserId = extractUserIdFromBarcode(rawValue);
      if (!extractedUserId) {
        setErrorMsg('Gagal mengekstrak ID user.');
        setPhase('error');
        processingRef.current = false;
        return;
      }

      const { data: userRecord } = await supabase
        .from('users')
        .select('id, name, role, team_id, teams(id, name)')
        .eq('id', extractedUserId)
        .maybeSingle();

      if (!userRecord) {
        setErrorMsg('User tidak ditemukan.');
        setPhase('error');
        processingRef.current = false;
        return;
      }

      const teamData = userRecord.teams as any;
      if (!teamData) {
        setErrorMsg('User belum masuk ke tim apapun.');
        setPhase('error');
        processingRef.current = false;
        return;
      }

      // --- HYBRID FLOW LOGIC ---
      
      // 1. Check for existing registration in queue
      const { data: existingReg } = await supabase
        .from('activity_registrations')
        .select('participant_ids')
        .eq('team_id', teamData.id)
        .eq('activity_id', activityId)
        .maybeSingle();

      const queueParticipantIds = Array.isArray(existingReg?.participant_ids) 
        ? existingReg.participant_ids as string[] 
        : [];

      // 2. Fetch ALL team members for selection
      const { data: membersRecord } = await supabase
        .from('users')
        .select('id, name, role')
        .eq('team_id', teamData.id)
        .in('role', ['captain', 'vice_captain', 'member'])
        .order('role', { ascending: true });

      // 3. If we are in 'giving_point' phase (Scoring Mode), scan is for confirmation
      if (phase === 'giving_point' && team) {
        if (userRecord.team_id !== team.id) {
          setErrorMsg(`Member ini (${userRecord.name}) bukan dari tim ${team.name}`);
          setPhase('error');
          processingRef.current = false;
          return;
        }

        // Must be in the current selection list to be confirmed
        if (!selectedMemberIds.includes(userRecord.id)) {
          setErrorMsg(`${userRecord.name} tidak ada dalam daftar antrean tim ini.`);
          setPhase('error');
          processingRef.current = false;
          return;
        }

        if (confirmedMemberIds.includes(userRecord.id)) {
          setErrorMsg(`${userRecord.name} sudah di-scan.`);
          setPhase('error');
          processingRef.current = false;
          return;
        }

        setConfirmedMemberIds(prev => [...prev, userRecord.id]);
        setScannedUser({ id: userRecord.id, name: userRecord.name, role: userRecord.role });
        
        // Return to scanning to allow next member confirmation — BUT stay in the same UI phase
        processingRef.current = false;
        return;
      }

      // 4. Fresh Scan / Choice Phase
      setTeam({ id: teamData.id, name: teamData.name, barcodeData: rawValue });
      setTeamMembers(membersRecord ?? []);
      setScannedUser({ id: userRecord.id, name: userRecord.name, role: userRecord.role });
      
      // Use existing queue if available
      if (queueParticipantIds.length > 0) {
        setSelectedMemberIds(queueParticipantIds);
      } else {
        setSelectedMemberIds([userRecord.id]); 
      }

      // --- NEW: DIRECT FLOW FOR CHALLENGE ---
      if (activityType !== 'wahana') {
        // Early duplicate check: has this member already received points for this challenge?
        const { data: existingScore } = await supabase
          .from('score_logs')
          .select('id')
          .eq('activity_id', activityId)
          .contains('participant_ids', [userRecord.id])
          .maybeSingle();

        if (existingScore) {
          setErrorMsg(`${userRecord.name} sudah mendapatkan poin untuk challenge ini.`);
          setPhase('error');
          processingRef.current = false;
          return;
        }

        // Direct to scoring, confirm the scanned member
        setConfirmedMemberIds([userRecord.id]);
        setPhase('giving_point');
      } else {
        setPhase('choosing');
      }
    }
    else {
      setErrorMsg('QR code tidak dikenali. Gunakan barcode member atau tim.');
      setPhase('error');
    }

    processingRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopCamera, activityId, phase, team, selectedMemberIds, confirmedMemberIds, startCamera]);

  // ── Actions ─────────────────────────────────────────────────────────────────

  const handleCheckin = async () => {
    if (!team) return;
    if (isSubmittingRef.current) return; // Debounce: block double-tap
    isSubmittingRef.current = true;
    setPhase('submitting');

    try {
      const token = await getAccessToken();
      const res = await fetch('/api/lo/checkin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ 
          team_id: team.id, 
          activity_id: activityId,
          participant_id: scannedUser?.id
        }),
      });

      if (res.ok) {
        const data = await res.json();
        // Instead of closing, we stay in a "Success/Continue" state
        setPhase('success');
        onCheckinSuccess(team.name, data.hint_granted);
      } else {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(
          (data as { error?: string }).error ?? 
          (res.status === 409 ? 'Tim sudah check-in sebelumnya.' : 'Gagal melakukan check-in.')
        );
        setPhase('error');
      }
    } catch {
      setErrorMsg('Gagal terhubung ke server.');
      setPhase('error');
    } finally {
      isSubmittingRef.current = false;
    }
  };

  const handleGivePointClick = () => {
    // If we started from a member scan, confirm them automatically
    if (scannedUser) {
      setConfirmedMemberIds([scannedUser.id]);
    } else {
      setConfirmedMemberIds([]);
    }
    
    setPhase('giving_point');
    // We stop the camera via useEffect when phase changes
  };

  const submitPoint = async () => {
    if (!team) return;
    if (isSubmittingRef.current) return; // Debounce: block double-tap
    isSubmittingRef.current = true;
    
    // For Two-Stage Scan, we only award points to those who were confirmed via scan
    const finalParticipantIds = confirmedMemberIds.length > 0 ? confirmedMemberIds : selectedMemberIds;
    // Opsi B: each participant earns full activityPoints (e.g. 6 people × 60 pts = 360 total)
    const calculatedPoints = activityPoints * finalParticipantIds.length;
    
    // Create detailed note
    const selectedNames = finalParticipantIds
      .map(id => {
        const found = teamMembers.find(m => m.id === id) || (scannedUser?.id === id ? scannedUser : null);
        return found?.name || 'Unknown';
      })
      .join(', ');
    
    const note = `Partisipan (${finalParticipantIds.length} orang): ${selectedNames}. (${activityPoints} poin/orang)`;

    try {
      setPhase('submitting');
      await stopCamera(); // Stop camera for the final submission success
      
      const token = await getAccessToken();
      const res = await fetch('/api/lo/score', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          team_id: team.id, 
          activity_id: activityId, 
          points: calculatedPoints,
          participant_ids: finalParticipantIds,
          note
        }),
      });

      if (res.ok) {
        setPhase('success');
        // This is the final success for this team, it will close the modal via onScoringSuccess in the parent
        setTimeout(() => onScoringSuccess(team.name, calculatedPoints), 1200);
      } else {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(
          (data as { error?: string }).error ?? 
          (res.status === 409 ? 'Tim sudah mendapat poin di wahana ini.' : 'Gagal memberikan poin.')
        );
        setPhase('error');
      }
    } catch {
      setErrorMsg('Gagal terhubung ke server.');
      setPhase('error');
    } finally {
      isSubmittingRef.current = false;
    }
  };

  const handleRetry = () => {
    setPhase('scanning');
    setTeam(null);
    setTeamMembers([]);
    setSelectedMemberIds([]);
    setConfirmedMemberIds([]);
    setErrorMsg('');
    processingRef.current = false;
    isSubmittingRef.current = false; // Reset debounce guard on retry
    // useEffect will handle startCamera
  };

  const handleClose = () => {
    if (phase === 'submitting') return;
    onClose();
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="scan-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          style={{ background: 'rgba(5, 12, 8, 0.95)' }}
          onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
        >
          <motion.div
            key="scan-card"
            initial={{ scale: 0.92, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 20 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="adventure-card w-full max-w-sm mx-auto overflow-y-auto max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-primary/20 bg-primary/5">
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4 text-primary torch-glow" />
                <h2 className="font-adventure text-sm uppercase tracking-[0.3em] text-primary">
                  {phase === 'choosing' ? `Tim: ${team?.name}` : 'Scan QR Code Tim'}
                </h2>
              </div>
              <button
                onClick={handleClose}
                disabled={phase === 'submitting'}
                className="text-foreground/40 hover:text-foreground transition-colors disabled:opacity-30"
                aria-label="Tutup"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Camera viewfinder — only shown during scanning */}
            {phase === 'scanning' && (
              <div className="relative bg-black">
                <div id={scannerId} className="w-full" style={{ minHeight: '280px' }} />

                {/* Viewfinder overlay */}
                {!cameraError && (
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className="relative w-52 h-52">
                      <span className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-primary/80" />
                      <span className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-primary/80" />
                      <span className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-primary/80" />
                      <span className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-primary/80" />
                      <motion.div
                        className="absolute left-1 right-1 h-0.5 bg-primary/60"
                        animate={{ top: ['10%', '90%', '10%'] }}
                        transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }}
                      />
                    </div>
                  </div>
                )}

                {cameraError && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-black/80 text-center gap-4">
                    <CameraOff className="w-10 h-10 text-red-400/80" />
                    <p className="text-xs font-content text-red-300/80 leading-relaxed">{cameraError}</p>
                  </div>
                )}
              </div>
            )}

            {/* Body — action area */}
            <div className="px-6 py-5">
              <AnimatePresence mode="wait">

                {/* Scanning hint */}
                {phase === 'scanning' && !cameraError && (
                  <motion.p
                    key="hint"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="text-[11px] font-content text-muted-foreground italic text-center opacity-60"
                  >
                    Arahkan kamera ke QR code tim
                  </motion.p>
                )}

                {/* Choose action */}
                {phase === 'choosing' && team && (
                  <motion.div
                    key="choosing"
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="space-y-3"
                  >
                    <p className="text-[10px] uppercase font-adventure tracking-widest text-primary/50 text-center mb-4">
                      Pilih aksi untuk tim ini
                    </p>
                    <button
                      onClick={handleCheckin}
                      className="w-full flex items-center gap-4 p-4 border border-primary/20 hover:border-primary hover:bg-primary/5 transition-all group"
                    >
                      <div className="bg-primary/10 p-2.5 rounded-lg group-hover:bg-primary/20 transition-colors">
                        <LogIn className="w-5 h-5 text-primary" />
                      </div>
                      <div className="text-left">
                        <p className="font-adventure text-sm text-primary tracking-wide">Check In</p>
                        <p className="text-[10px] text-foreground/40 font-content">Tim tiba di wahana ini</p>
                      </div>
                    </button>
                    <button
                      onClick={handleGivePointClick}
                      className="w-full flex items-center gap-4 p-4 border border-primary/20 hover:border-primary hover:bg-primary/5 transition-all group"
                    >
                      <div className="bg-primary/10 p-2.5 rounded-lg group-hover:bg-primary/20 transition-colors">
                        <Star className="w-5 h-5 text-primary" />
                      </div>
                      <div className="text-left">
                        <p className="font-adventure text-sm text-primary tracking-wide">Give Point</p>
                        <p className="text-[10px] text-foreground/40 font-content">Beri poin berdasarkan partisipasi</p>
                      </div>
                    </button>
                    <button
                      onClick={handleRetry}
                      className="w-full text-center text-[10px] font-adventure uppercase tracking-[0.2em] text-foreground/30 hover:text-foreground/60 transition-colors pt-1"
                    >
                      Scan Ulang
                    </button>
                  </motion.div>
                )}

                {/* Giving Point Phase */}
                {phase === 'giving_point' && team && (
                  <motion.div
                    key="giving_point"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-6"
                  >
                    <div className="text-center">
                      <p className="text-[10px] uppercase font-adventure tracking-widest text-primary/60 mb-1">
                        Scoring: {team.name}
                      </p>
                      <h3 className="font-adventure text-2xl text-primary gold-engraving">Konfirmasi Member</h3>
                      <p className="text-[11px] text-muted-foreground mt-2 italic font-content">
                        "Pilih member yang berpartisipasi untuk memberikan poin."
                      </p>
                    </div>

                    <div className="adventure-card bg-black/40 border border-primary/20 rounded-lg max-h-[50vh] overflow-y-auto custom-scrollbar p-3 space-y-2">
                      {selectedMemberIds.map(memberId => {
                        const isConfirmed = confirmedMemberIds.includes(memberId);
                        const memberName = teamMembers.find(m => m.id === memberId)?.name || 'Member';
                        
                        return (
                          <div 
                            key={memberId} 
                            onClick={() => {
                              if (isConfirmed) {
                                setConfirmedMemberIds(prev => prev.filter(id => id !== memberId));
                              } else {
                                setConfirmedMemberIds(prev => [...prev, memberId]);
                              }
                            }}
                            className={`flex items-center justify-between p-3 border rounded-sm transition-all duration-300 cursor-pointer ${
                              isConfirmed 
                                ? 'bg-primary/20 border-primary/40 shadow-[0_0_15px_rgba(var(--primary-rgb),0.1)]' 
                                : 'bg-white/5 border-white/10 opacity-60 hover:bg-white/10'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              {isConfirmed ? (
                                <CheckCircle2 className="w-4 h-4 text-primary" />
                              ) : (
                                <div className="w-4 h-4 rounded-full border-2 border-primary/20 animate-pulse" />
                              )}
                              <span className={`text-xs font-adventure uppercase tracking-wider ${isConfirmed ? 'text-primary' : 'text-foreground/70'}`}>
                                {memberName}
                              </span>
                            </div>
                            {isConfirmed && (
                              <span className="text-[9px] font-adventure text-primary/60">CONFIRMED</span>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex gap-3 pt-2">
                      <button
                        onClick={submitPoint}
                        disabled={confirmedMemberIds.length === 0}
                        className="w-full py-4 font-adventure text-xs uppercase tracking-[0.2em] bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-[0_10px_20px_rgba(var(--primary-rgb),0.4)] disabled:opacity-20 active:scale-95"
                      >
                        Kirim Poin ({confirmedMemberIds.length})
                      </button>
                    </div>

                    <div className="flex items-center justify-center gap-2 py-2">
                      <div className="h-px flex-1 bg-primary/10" />
                      <span className="text-[9px] font-adventure text-primary/40 uppercase tracking-[0.2em]">
                        {confirmedMemberIds.length} of {selectedMemberIds.length} members confirmed
                      </span>
                      <div className="h-px flex-1 bg-primary/10" />
                    </div>
                  </motion.div>
                )}

                {/* Submitting */}
                {phase === 'submitting' && (
                  <motion.div
                    key="submitting"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="flex flex-col items-center gap-4 py-12"
                  >
                    <div className="relative">
                      <Loader2 className="w-12 h-12 text-primary animate-spin" />
                      <div className="absolute inset-0 bg-primary/20 blur-xl animate-pulse rounded-full" />
                    </div>
                    <p className="text-xs font-adventure uppercase tracking-[0.3em] text-primary/60">
                      Recording Participation...
                    </p>
                  </motion.div>
                )}



                {/* Success */}
                {phase === 'success' && (
                  <motion.div
                    key="success"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center text-center gap-6 py-8"
                  >
                    <div className="w-20 h-20 bg-primary/20 rounded-full flex items-center justify-center border border-primary/30 relative">
                      <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full" />
                      <CheckCircle2 className="w-10 h-10 text-primary relative z-10" />
                    </div>
                    <div>
                      <h3 className="font-adventure text-2xl gold-engraving mb-2">Points Recorded!</h3>
                      <p className="text-sm font-content text-foreground/60">
                        {confirmedMemberIds.length > 0 
                          ? `${confirmedMemberIds.length} anggota tim berhasil mendapat poin.`
                          : scannedUser 
                            ? `${scannedUser.name} telah terdata.` 
                            : `Tim ${team?.name} berhasil mendapat poin.`
                        }
                      </p>
                    </div>

                    <div className="w-full space-y-3 pt-4">
                      <button
                        onClick={handleRetry}
                        className="w-full py-4 bg-primary text-primary-foreground font-adventure text-xs uppercase tracking-[0.2em] hover:bg-primary/90 transition-all shadow-[0_10px_20px_rgba(0,0,0,0.3)]"
                      >
                        Scan Anggota Berikutnya
                      </button>
                      <button
                        onClick={onClose}
                        className="w-full py-3 text-[10px] font-adventure uppercase tracking-widest text-foreground/40 hover:text-foreground/70 transition-colors"
                      >
                        Selesai & Tutup
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* Error */}
                {phase === 'error' && (
                  <motion.div
                    key="error"
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="flex flex-col items-center gap-3"
                  >
                    <div className="flex items-start gap-2 p-3 bg-red-900/30 border border-red-500/30 rounded-sm w-full">
                      <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                      <p className="text-[11px] font-content text-red-300/90 leading-relaxed">{errorMsg}</p>
                    </div>
                    <button
                      onClick={handleRetry}
                      className="text-[10px] font-adventure uppercase tracking-[0.2em] text-primary/70 hover:text-primary transition-colors"
                    >
                      Scan Ulang
                    </button>
                  </motion.div>
                )}

              </AnimatePresence>
            </div>

            {phase !== 'success' && phase !== 'submitting' && (
              <div className="px-6 pb-5">
                <button
                  onClick={handleClose}
                  className="w-full py-3 font-adventure text-xs uppercase tracking-[0.2em] border border-primary/20 text-foreground/50 hover:text-foreground hover:border-primary/40 transition-all"
                >
                  Tutup
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
