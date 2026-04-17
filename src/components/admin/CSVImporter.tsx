'use client';

import { useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { parseTeamCSV, type MemberRecord } from '@/lib/auth';
import { Upload, AlertTriangle, CheckCircle, X, FileText, Loader2 } from 'lucide-react';

interface CSVImporterProps {
  teamId: string;
  eventId: string;
  onImportComplete?: () => void;
}

/**
 * CSV importer component for bulk member import.
 * Parses CSV using parseTeamCSV, shows preview + validation errors,
 * then submits valid records to Supabase.
 * Requirements: 2.2, 2.3
 */
export default function CSVImporter({ teamId, eventId, onImportComplete }: CSVImporterProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [records, setRecords] = useState<MemberRecord[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number; failed: number } | null>(null);

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

    let successCount = 0;
    let failedCount = 0;

    for (const record of records) {
      try {
        // Create Supabase Auth user with email = npk@fif.internal
        const email = `${record.npk}@fif.internal`;
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
          email,
          password: record.no_unik,
          email_confirm: true,
        });

        if (authError || !authData.user) {
          failedCount++;
          continue;
        }

        // Insert into users table
        const { error: userError } = await supabase.from('users').insert({
          auth_id: authData.user.id,
          nama: record.nama,
          npk: record.npk,
          no_unik: record.no_unik,
          role: record.role,
          team_id: teamId,
          event_id: eventId,
        });

        if (userError) {
          failedCount++;
          continue;
        }

        successCount++;
      } catch {
        failedCount++;
      }
    }

    setImporting(false);
    setImportResult({ success: successCount, failed: failedCount });

    if (successCount > 0 && onImportComplete) {
      onImportComplete();
    }
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
            <p className="text-[10px] text-muted-foreground italic">
              Required columns: nama, npk, no_unik, role
            </p>
          </>
        )}
      </div>

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
                  <th className="text-left px-3 py-2 text-primary/60 font-adventure uppercase tracking-wider text-[10px]">Nama</th>
                  <th className="text-left px-3 py-2 text-primary/60 font-adventure uppercase tracking-wider text-[10px]">NPK</th>
                  <th className="text-left px-3 py-2 text-primary/60 font-adventure uppercase tracking-wider text-[10px]">No Unik</th>
                  <th className="text-left px-3 py-2 text-primary/60 font-adventure uppercase tracking-wider text-[10px]">Role</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r, i) => (
                  <tr key={i} className="border-t border-primary/5 hover:bg-primary/5 transition-colors">
                    <td className="px-3 py-2 text-foreground/80">{r.nama}</td>
                    <td className="px-3 py-2 text-foreground/60">{r.npk}</td>
                    <td className="px-3 py-2 text-foreground/40">{'•'.repeat(Math.min(r.no_unik.length, 6))}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 text-[9px] font-adventure uppercase tracking-wider ${
                        r.role === 'kaptain' ? 'bg-primary/20 text-primary' :
                        r.role === 'cocaptain' ? 'bg-secondary/20 text-secondary-foreground' :
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
        <div className={`border p-4 flex items-center gap-3 ${
          importResult.failed === 0
            ? 'border-green-500/30 bg-green-500/5'
            : 'border-yellow-500/30 bg-yellow-500/5'
        }`}>
          <CheckCircle className={`w-5 h-5 ${importResult.failed === 0 ? 'text-green-400' : 'text-yellow-400'}`} />
          <div>
            <p className="font-adventure text-xs uppercase tracking-widest text-foreground/80">
              Import Complete
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {importResult.success} imported successfully
              {importResult.failed > 0 && `, ${importResult.failed} failed`}
            </p>
          </div>
        </div>
      )}

      {/* Import Button */}
      {records.length > 0 && !importResult && (
        <button
          onClick={handleImport}
          disabled={importing}
          className="w-full flex items-center justify-center gap-3 bg-primary/10 hover:bg-primary/20 border border-primary/30 hover:border-primary/50 text-primary py-4 font-adventure uppercase tracking-widest text-xs transition-all disabled:opacity-40"
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
