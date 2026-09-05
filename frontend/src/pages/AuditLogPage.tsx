import React, { useEffect, useState } from 'react';
import { History, RefreshCw, ShieldCheck } from 'lucide-react';
import type { AuditActionLog } from '../types/commerce';

export const AuditLogPage: React.FC = () => {
  const [logs, setLogs] = useState<AuditActionLog[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch('http://localhost:3000/api/v1/dashboard/audit-logs');
      if (res.ok) {
        const json = await res.json();
        setLogs(json);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="bg-[#191513] border border-[#332B25] rounded-xl p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-[#EDE5DE] flex items-center gap-2 mb-1">
              <History className="w-5 h-5 text-[#D9C3B0]" />
              Immutable Agent Decision Ledger
            </h2>
            <p className="text-xs text-[#8C7A6B] font-mono">
              Live audit table queried directly from MySQL `agent_actions`
            </p>
          </div>
          <button 
            onClick={fetchLogs}
            className="p-2 rounded bg-[#241E1B] text-[#D9C3B0] hover:bg-[#332B25] border border-[#332B25]"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead>
              <tr className="border-b border-[#332B25] text-[#8C7A6B]">
                <th className="pb-3">TIMESTAMP</th>
                <th className="pb-3">ROLE</th>
                <th className="pb-3">ACTION</th>
                <th className="pb-3">DECISION</th>
                <th className="pb-3">REASONING</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#332B25]/50 text-[#EDE5DE]">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-[#8C7A6B]">
                    No actions logged in database yet.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-[#241E1B]/50 transition-colors">
                    <td className="py-3 text-[#8C7A6B]">{new Date(log.createdAt).toLocaleTimeString()}</td>
                    <td className="py-3 font-bold text-[#D9C3B0]">{log.agentRole}</td>
                    <td className="py-3 text-[#EDE5DE]">{log.action}</td>
                    <td className="py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] ${
                        log.decision === 'ACCEPTED' || log.decision === 'CAPTURED'
                          ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-900/40'
                          : 'bg-[#0D0B0A] text-amber-300 border border-[#332B25]'
                      }`}>
                        {log.decision}
                      </span>
                    </td>
                    <td className="py-3 text-[#8C7A6B] max-w-sm truncate" title={log.reason}>
                      {log.reason}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};