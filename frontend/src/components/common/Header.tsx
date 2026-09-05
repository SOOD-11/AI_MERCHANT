import React from 'react';
import { NavLink } from 'react-router-dom';
import { Boxes, RefreshCw, AlertTriangle } from 'lucide-react';
import { useCommerce } from '../../context/CommerceContext';

export const Header: React.FC = () => {
  const { metrics, refreshTelemetry, isProcessing } = useCommerce();

  return (
    <header className="border-b border-[#332B25] bg-[#14100E]/90 backdrop-blur sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#332B25] flex items-center justify-center border border-[#594436]">
              <Boxes className="w-5 h-5 text-[#D9C3B0]" />
            </div>
            <div>
              <span className="text-sm font-semibold tracking-wider text-[#EDE5DE]">APEX COMMERCE</span>
              <span className="ml-2 text-[10px] px-2 py-0.5 rounded bg-[#332B25] text-[#D9C3B0] font-mono">
                DUAL-LEG v1.0
              </span>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-1 font-mono text-xs">
            {[
              { label: 'Leg 1: Retail Procurement', path: '/' },
              { label: 'Leg 2: Wholesale Treasury', path: '/wholesale' },
              { label: 'Warehouse Catalog', path: '/inventory' },
              { label: 'Audit Trail', path: '/audit' },
            ].map((link) => (
              <NavLink
                key={link.path}
                to={link.path}
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-md transition-all ${
                    isActive
                      ? 'bg-[#241E1B] text-[#D9C3B0] font-bold border border-[#594436]'
                      : 'text-[#8C7A6B] hover:text-[#EDE5DE]'
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono">
          {metrics.pendingEscalations > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-950/40 border border-amber-800 text-amber-300">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>{metrics.pendingEscalations} Pending Approval</span>
            </div>
          )}
          <button 
            onClick={() => refreshTelemetry()}
            className="text-[#8C7A6B] hover:text-[#D9C3B0] transition-colors p-1"
            title="Sync MySQL"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isProcessing ? 'animate-spin text-[#D9C3B0]' : ''}`} />
          </button>
          <div className="flex items-center gap-2 px-3 py-1 rounded bg-[#191513] border border-[#332B25]">
            <span className="text-[#8C7A6B]">WH Available:</span>
            <span className={`font-bold ${metrics.stockAvailable <= 5 ? 'text-amber-400' : 'text-[#D9C3B0]'}`}>
              {metrics.stockAvailable} Units
            </span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1 rounded bg-[#191513] border border-[#332B25]">
            <span className="text-[#8C7A6B]">Revenue Captured:</span>
            <span className="text-emerald-400 font-bold">
              ₹{metrics.totalRevenueInr.toLocaleString('en-IN')}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};