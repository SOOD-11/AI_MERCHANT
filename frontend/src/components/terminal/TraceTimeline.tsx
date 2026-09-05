import React from 'react';
import type { TraceItem } from '../../types/commerce';

export const TraceTimeline: React.FC<{ traces: TraceItem[] }> = ({ traces }) => {
  return (
    <div className="bg-[#191513] border border-[#332B25] rounded-xl p-5 shadow-xl">
      <h3 className="text-xs font-mono uppercase tracking-wider text-[#8C7A6B] mb-4">
        Execution Trace Log
      </h3>
      <div className="space-y-3 font-mono text-[11px] max-h-56 overflow-y-auto">
        {traces.length === 0 ? (
          <p className="text-[#8C7A6B] italic">No active traces. Telemetry idle.</p>
        ) : (
          traces.map((trace, idx) => (
            <div key={idx} className="flex items-start gap-2 border-l border-[#332B25] pl-3 py-0.5">
              <span className="text-[#D9C3B0] font-bold">[{trace.stage}]</span>
              <span className="text-[#EDE5DE]">{trace.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};