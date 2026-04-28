'use client';

import { useState, useRef } from 'react';
import { parseTeamCSV, type MemberRecord } from '@/lib/auth';
import { Upload, AlertTriangle, CheckCircle, X, FileText, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
interface CSVImporterProps {
  teamId: string;
  teamName?: string;
  onImportComplete?: () => void;
}

/**
 * CSV importer component for bulk member import.
 * Parses CSV using parseTeamCSV, shows preview + validation errors,
 * then submits valid records to Supabase.
 * Requirements: 2.2, 2.3
 */
export default function CSVImporter({ teamId, teamName, onImportComplete }: CSVImporterProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [records, setRecords] = useState<MemberRecord[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [importResult, setImportResult] = useState<{ success: number; failed: number; failedRows: any[] } | null>(null);
  const [currentBatchInfo, setCurrentBatchInfo] = useState<string>('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setImportResult(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const result = parseTeamCSV(content);
      setRecords(result.records);
      setErrors(result.errors);
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handleImport = async () => {
    if (records.length === 0) return;
    setImporting(true);
    setImportResult(null);
    setProgress(0);

    const batchSize = 5; // Reduced from 25 to 5 to prevent Vercel timeouts (auth creation is slow)
    const totalRecords = records.length;
    let totalSuccess = 0;
    let totalFailed = 0;
    const allFailedRows: any[] = [];

    // Map MemberRecord → ParsedUserRow shape expected by /api/users/bulk
    const allRows = records.map((r) => ({
      name: r.name,
      npk: r.npk,
      role: r.role,
      birth_date: r.birth_date,
      team_name: teamName ?? '',
    }));

    for (let i = 0; i < allRows.length; i += batchSize) {
      const batch = allRows.slice(i, i + batchSize);
      const batchIndex = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(allRows.length / batchSize);
      
      setCurrentBatchInfo(`Processing batch ${batchIndex} of ${totalBatches}...`);

      try {
        const res = await fetch('/api/users/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows: batch }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Unknown server error' }));
          totalFailed += batch.length;
          allFailedRows.push({ row: `Batch ${batchIndex}`, reason: err.error || 'Server error' });
        } else {
          const { report } = await res.json();
          totalSuccess += (report?.usersCreated ?? 0) + (report?.usersSkipped ?? 0) + (report?.assignmentsSuccess ?? 0);
          totalFailed += report?.failed ?? 0;
          if (report?.failedRows) {
            allFailedRows.push(...report.failedRows.map((fr: any) => ({
              row: i + fr.row,
              reason: fr.reason
            })));
          }
        }
      } catch (err: any) {
        totalFailed += batch.length;
        allFailedRows.push({ row: `Batch ${batchIndex}`, reason: err.message || 'Network error' });
      }

      // Update progress
      const processed = Math.min(i + batchSize, totalRecords);
      setProgress(Math.round((processed / totalRecords) * 100));
    }

    setImportResult({ 
      success: totalSuccess, 
      failed: totalFailed, 
      failedRows: allFailedRows 
    });

    if (totalSuccess > 0 && onImportComplete) {
      onImportComplete();
    }
    
    setImporting(false);
    setCurrentBatchInfo('');
  };

  const handleReset = () => {
    setFileName(null);
    setRecords([]);
    setErrors([]);
    setImportResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="space-y-6">
      {/* File Upload Area */}
      <div
        className="border-2 border-dashed border-primary/20 hover:border-primary/40 transition-colors p-8 text-center cursor-pointer"
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          className="hidden"
        />
        <Upload className="w-8 h-8 text-primary/40 mx-auto mb-3" />
        {fileName ? (
          <div className="flex items-center justify-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            <span className="font-adventure text-sm text-primary">{fileName}</span>
          </div>
        ) : (
          <>
            <p className="font-adventure text-sm text-foreground/60 uppercase tracking-widest mb-1">
              Upload CSV File
            </p>
            <p className="text-[10px] text-muted-foreground italic mb-2">
              Required columns: name, npk, birth_date, role
            </p>
            <p className="text-[9px] text-yellow-500/80 font-adventure uppercase tracking-tighter">
              ⚠️ Maximum 500 rows per upload for stability
            </p>
          </>
        )}
      </div>

      {/* Row Count Warning */}
      {records.length > 500 && (
        <div className="border border-yellow-500/30 bg-yellow-500/5 p-3 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-xs font-adventure uppercase text-yellow-400">File Too Large ({records.length} rows)</p>
            <p className="text-[10px] text-muted-foreground">
              Please split your CSV into files of maximum 500 rows each to ensure a successful import without server timeouts.
            </p>
          </div>
        </div>
      )}

      {/* Validation Errors */}
      {errors.length > 0 && (
        <div className="border border-red-500/30 bg-red-500/5 p-4 space-y-2">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <p className="font-adventure text-xs uppercase tracking-widest text-red-400">
              Validation Errors ({errors.length})
            </p>
          </div>
          <div className="max-h-32 overflow-y-auto space-y-1">
            {errors.map((err, i) => (
              <p key={i} className="text-[11px] text-red-300/80 font-mono">
                {err}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Preview Table */}
      {records.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-adventure text-xs uppercase tracking-widest text-primary">
              Preview — {records.length} Records
            </p>
            <button onClick={handleReset} className="text-[10px] text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-3 h-3 inline mr-1" />
              Clear
            </button>
          </div>

          <div className="overflow-x-auto max-h-48 overflow-y-auto border border-primary/10">
            <table className="w-full text-[11px] font-mono">
              <thead className="bg-primary/5 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 text-primary/60 font-adventure uppercase tracking-wider text-[10px]">Name</th>
                  <th className="text-left px-3 py-2 text-primary/60 font-adventure uppercase tracking-wider text-[10px]">NPK</th>
                  <th className="text-left px-3 py-2 text-primary/60 font-adventure uppercase tracking-wider text-[10px]">Birth Date</th>
                  <th className="text-left px-3 py-2 text-primary/60 font-adventure uppercase tracking-wider text-[10px]">Role</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r, i) => (
                  <tr key={i} className="border-t border-primary/5 hover:bg-primary/5 transition-colors">
                    <td className="px-3 py-2 text-foreground/80">{r.name}</td>
                    <td className="px-3 py-2 text-foreground/60">{r.npk}</td>
                    <td className="px-3 py-2 text-foreground/60">{r.birth_date ? '•'.repeat(Math.min(r.birth_date.length, 6)) : '—'}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 text-[9px] font-adventure uppercase tracking-wider ${
                        r.role === 'captain' ? 'bg-primary/20 text-primary' :
                        r.role === 'lo' ? 'bg-blue-500/20 text-blue-300' :
                        'bg-foreground/10 text-foreground/60'
                      }`}>
                        {r.role}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Import Result */}
      {importResult && (
        <div className={`border p-4 space-y-4 ${
          importResult.failed === 0
            ? 'border-green-500/30 bg-green-500/5'
            : 'border-yellow-500/30 bg-yellow-500/5'
        }`}>
          <div className="flex items-center gap-3">
            <CheckCircle className={`w-5 h-5 ${importResult.failed === 0 ? 'text-green-400' : 'text-yellow-400'}`} />
            <div>
              <p className="font-adventure text-xs uppercase tracking-widest text-foreground/80">
                Import Process Finished
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                <span className="text-green-400">{importResult.success}</span> successfully processed, 
                <span className="text-red-400 ml-1">{importResult.failed}</span> failed
              </p>
            </div>
          </div>

          {importResult.failedRows.length > 0 && (
            <div className="border-t border-primary/10 pt-3 mt-3">
              <p className="text-[10px] font-adventure uppercase tracking-widest text-red-400 mb-2 flex items-center gap-2">
                <AlertTriangle className="w-3 h-3" />
                Failure Details
              </p>
              <div className="max-h-32 overflow-y-auto space-y-1 pr-2 custom-scrollbar">
                {importResult.failedRows.map((err, i) => (
                  <div key={i} className="flex justify-between items-start gap-4 text-[10px] bg-black/20 p-2 rounded-sm">
                    <span className="text-muted-foreground font-mono">Row {err.row}</span>
                    <span className="text-red-300 text-right">{err.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          <button 
            onClick={handleReset}
            className="w-full py-2 bg-primary/5 hover:bg-primary/10 text-[10px] font-adventure uppercase tracking-[0.2em] text-primary transition-all border border-primary/20"
          >
            Start New Import
          </button>
        </div>
      )}

      {/* Progress Indicator */}
      {importing && (
        <div className="space-y-3 bg-black/40 p-4 border border-primary/20 rounded-lg animate-pulse">
          <div className="flex justify-between items-center text-[10px] font-adventure uppercase tracking-widest text-primary/80">
            <span>{currentBatchInfo}</span>
            <span>{progress}%</span>
          </div>
          <div className="h-1.5 w-full bg-primary/10 rounded-full overflow-hidden border border-primary/5">
            <motion.div 
              className="h-full bg-primary shadow-[0_0_15px_rgba(212,175,55,0.4)]"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
          <p className="text-[9px] text-muted-foreground italic text-center">
            Processing massive expedition roster... Please do not close this window.
          </p>
        </div>
      )}

      {/* Import Button */}
      {records.length > 0 && !importResult && (
        <button
          onClick={handleImport}
          disabled={importing || records.length > 500}
          className="w-full flex items-center justify-center gap-3 bg-primary/10 hover:bg-primary/20 border border-primary/30 hover:border-primary/50 text-primary py-4 font-adventure uppercase tracking-widest text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {importing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Importing {records.length} Records...
            </>
          ) : (
            <>
              <Upload className="w-4 h-4" />
              Import {records.length} Members
            </>
          )}
        </button>
      )}
    </div>
  );
}
