import React, { useEffect, useState } from 'react';
import { Package, ShieldAlert, CheckCircle, RefreshCw } from 'lucide-react';
import type { CatalogItem } from '../types/commerce';

export const InventoryCatalogPage: React.FC = () => {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [merchant, setMerchant] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchCatalog = async () => {
    setLoading(true);
    try {
      const res = await fetch('http://localhost:3000/.well-known/agent-commerce.json');
      if (res.ok) {
        const json = await res.json();
        setCatalog(json.catalog || []);
        setMerchant(json.merchant);
      }
    } catch (err) {
      console.error('Failed to load catalog:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCatalog();
  }, []);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="bg-[#191513] border border-[#332B25] rounded-xl p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-[#EDE5DE] flex items-center gap-2 mb-1">
              <Package className="w-5 h-5 text-[#D9C3B0]" />
              Machine-Readable Merchant Catalog
            </h2>
            <p className="text-xs text-[#8C7A6B] font-mono">
              Live discovery endpoint: <code className="text-[#D9C3B0]">/.well-known/agent-commerce.json</code> ({merchant?.name || 'Apex Storefront'})
            </p>
          </div>
          <button 
            onClick={fetchCatalog}
            className="p-2 rounded bg-[#241E1B] text-[#D9C3B0] hover:bg-[#332B25] border border-[#332B25]"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead>
              <tr className="border-b border-[#332B25] text-[#8C7A6B]">
                <th className="pb-3">PRODUCT SKU</th>
                <th className="pb-3">PRODUCT NAME</th>
                <th className="pb-3">MSRP (INR)</th>
                <th className="pb-3">WAREHOUSE STOCK</th>
                <th className="pb-3 text-right">POLICY BUFFER</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#332B25]/50 text-[#EDE5DE]">
              {catalog.map((item) => (
                <tr key={item.sku} className="hover:bg-[#241E1B]/50 transition-colors">
                  <td className="py-4 font-bold text-[#D9C3B0]">{item.sku}</td>
                  <td className="py-4">{item.name}</td>
                  <td className="py-4">₹{Number(item.msrp).toLocaleString('en-IN')}</td>
                  <td className="py-4">
                    <span className={`px-2 py-1 rounded font-bold ${item.availableUnits <= 5 ? 'bg-amber-900/30 text-amber-300' : 'bg-[#0D0B0A] text-emerald-400'}`}>
                      {item.availableUnits} Units
                    </span>
                  </td>
                  <td className="py-4 text-right">
                    {item.availableUnits <= 5 ? (
                      <span className="text-amber-400 text-[10px] inline-flex items-center gap-1">
                        <ShieldAlert className="w-3.5 h-3.5" /> Deficit Trigger Active
                      </span>
                    ) : (
                      <span className="text-emerald-400 text-[10px] inline-flex items-center gap-1">
                        <CheckCircle className="w-3.5 h-3.5" /> Optimal Buffer
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};