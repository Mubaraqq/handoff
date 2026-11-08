// ==========================================================
// FILE: pages/Dashboard.tsx
// PURPOSE: Shows the user's active deals. For this hackathon,
// we store deal addresses in localStorage so they load instantly.
// ==========================================================

import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { getStatusBadge } from '../lib/dealState';
import { formatUsdc, shortAddress } from '../lib/format';
import { Card, Button } from '../components/ui';
import { useDemoRole } from '../lib/demo/DemoRoleContext';
import { useHandoffProgram } from '../hooks/useHandoffProgram';
import { mapEscrow } from '../lib/program/escrowMapper';
import type { Deal } from '../types/deal';

// A single row in the dashboard
function DealRow({ address, onClick }: { address: string, onClick: () => void }) {
  const program = useHandoffProgram();
  const { signer } = useDemoRole();
  const [deal, setDeal] = useState<Deal | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const fetchDeal = async () => {
      try {
        const pubkey = new PublicKey(address);
        // Fetch directly from Anchor, bypassing the complex retry loop
        const raw = await (program.account as any).escrowState.fetch(pubkey);

        if (mounted) {
          setDeal(mapEscrow(pubkey, raw));
          setLoading(false);
        }
      } catch (e) {
        console.log("Failed to load deal in dashboard:", address, e);
        if (mounted) setLoading(false); // Stop loading if it fails
      }
    };

    fetchDeal();
    return () => { mounted = false; };
  }, [address, program]);

  // Show a loading skeleton while fetching data from the blockchain
  if (loading) {
    return (
      <div className="h-24 rounded-2xl border border-gray-800 bg-[#0A0A0A] overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.03] to-transparent animate-pulse" />
      </div>
    );
  }

  // Skip rendering if the deal doesn't exist or errored
  if (!deal) return null;

  const badge = getStatusBadge(deal.status, deal);
  const isBuyer = signer?.publicKey.equals(deal.buyer);
  const roleText = isBuyer ? 'Buyer' : 'Seller';

  return (
    <Card
      className="p-5 cursor-pointer group hover:border-emerald-400/20 hover:bg-[#0D0D0D] hover:shadow-[0_8px_30px_rgba(0,0,0,0.5),0_0_20px_rgba(20,241,149,0.04)]"
      onClick={onClick}
    >
      <div className="flex justify-between items-center">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-all duration-200 ${badge.className}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${badge.dotClassName}`}></span>
              {badge.label}
            </span>
            <span className="text-gray-500 text-sm font-mono">
              #{deal.dealId.toString()}
            </span>
            <span className="text-xs px-2 py-0.5 rounded-md bg-gray-800/80 text-gray-300 border border-gray-800">
              {roleText}
            </span>
          </div>

          <div className="text-2xl font-bold tracking-tight mb-1">
            {formatUsdc(deal.amount)} <span className="text-lg text-gray-500 font-normal">USDC</span>
          </div>

          <div className="text-sm text-gray-500 flex gap-4">
            <span>Buyer: {shortAddress(deal.buyer)}</span>
            <span>Seller: {shortAddress(deal.seller)}</span>
          </div>
        </div>

        <div className="text-gray-600 group-hover:text-[#14F195] group-hover:translate-x-1 transition-all duration-200">
          &rarr;
        </div>
      </div>
    </Card>
  );
}

interface DashboardProps {
  onCreateDeal: () => void;
  onSelectDeal: (address: string) => void;
}

export function Dashboard({ onCreateDeal, onSelectDeal }: DashboardProps) {
  const { publicKey } = useWallet();
  const [dealAddresses, setDealAddresses] = useState<string[]>([]);

  // Load deal addresses from localStorage when the page loads
  useEffect(() => {
    if (!publicKey) return;
    const stored = localStorage.getItem(`handoff_deals_${publicKey.toBase58()}`);
    if (stored) {
      try {
        setDealAddresses(JSON.parse(stored));
      } catch (e) {
        console.error("Failed to parse stored deals");
      }
    }
  }, [publicKey]);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex justify-between items-end mb-10">
        <div>
          <h1 className="text-4xl font-bold tracking-tight mb-2">
            Your{' '}
            <span className="bg-gradient-to-r from-[#14F195] to-[#9945FF] bg-clip-text text-transparent">
              Deals
            </span>
          </h1>
          <p className="text-gray-400">Manage your active escrows.</p>
        </div>
        <Button onClick={onCreateDeal}>Create Deal</Button>
      </div>

      {dealAddresses.length === 0 ? (
        <Card className="p-20 text-center border-dashed !border-gray-800 hover:!border-gray-700/70">
          <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-[#9945FF]/20 to-[#14F195]/20 border border-gray-800 flex items-center justify-center text-3xl shadow-[0_0_30px_rgba(20,241,149,0.08)]">
            📦
          </div>
          <h3 className="text-xl font-semibold tracking-tight mb-2">No active deals</h3>
          <p className="text-gray-400 mb-8 max-w-sm mx-auto">
            You haven't created any escrows yet. Start by locking funds for a digital asset.
          </p>
          <Button onClick={onCreateDeal} variant="secondary">Create your first deal</Button>
        </Card>
      ) : (
        <div className="grid gap-4">
          {dealAddresses.map((address) => (
            <DealRow
              key={address}
              address={address}
              onClick={() => onSelectDeal(address)}
            />
          ))}
        </div>
      )}
    </div>
  );
}