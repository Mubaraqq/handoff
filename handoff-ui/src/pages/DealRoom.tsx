// ==========================================================
// FILE: pages/DealRoom.tsx
// PURPOSE: The main screen for a specific deal. It shows the
// timeline, the amount locked, the terms, and action buttons.
// ==========================================================

import { useState, useEffect } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { useDeal } from '../hooks/useDeal';
import { useRole } from '../hooks/useRole';
import { useChainNow } from '../hooks/useChainNow';
import { getPanel, getStatusBadge, getTimeline } from '../lib/dealState';
import { formatUsdc, parseFileHash } from '../lib/format';
import { useHandoffProgram } from '../hooks/useHandoffProgram';
import { useDemoRole } from '../lib/demo/DemoRoleContext';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { getUsdcMint } from '../lib/constants';
import type { Deal, ActionId } from '../types/deal';

// --- COMPONENTS ---

// The countdown timer displayed on the action panel
function Countdown({ deadline, label }: { deadline: number, label: string }) {
  const now = useChainNow();
  const remaining = Math.max(0, deadline - now);

  const hours = Math.floor(remaining / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  const seconds = remaining % 60;

  return (
    <div className="mt-4 bg-black border border-gray-800 rounded-xl p-4 text-center shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]">
      <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">{label}</p>
      <div className="font-mono text-3xl font-bold tabular-nums tracking-tighter text-white">
        {hours.toString().padStart(2, '0')}:{minutes.toString().padStart(2, '0')}:{seconds.toString().padStart(2, '0')}
      </div>
    </div>
  );
}

// The 4-step progress tracker
function Timeline({ deal }: { deal: Deal }) {
  const { steps, terminal } = getTimeline(deal.status, deal);

  return (
    <div className="relative mt-12 mb-10">
      <div className="absolute top-3 left-0 w-full h-px bg-gray-800" />
      <div className="relative flex justify-between">
        {steps.map((step) => (
          <div key={step.key} className="flex flex-col items-center">
            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center z-10 transition-all duration-200 ${
              step.state === 'done'
                ? 'bg-[#14F195] border-[#14F195] shadow-[0_0_12px_rgba(20,241,149,0.6)]'
                :
              step.state === 'current'
                ? 'bg-black border-[#14F195] ring-4 ring-[#14F195]/20 shadow-[0_0_14px_rgba(20,241,149,0.45)]'
                :
              'bg-black border-gray-800'
            }`}>
              {step.state === 'done' && <span className="text-black text-xs font-bold">✓</span>}
            </div>
            <span className={`mt-3 text-xs font-medium transition-colors duration-200 ${
              step.state === 'done'
                ? 'text-gray-300'
                :
              step.state === 'current'
                ? 'text-[#14F195]'
                :
              'text-gray-600'
            }`}>
              {step.label}
            </span>
          </div>
        ))}
      </div>
      {terminal && (
        <div className="absolute top-0 right-0 transform translate-x-1/3 -translate-y-1/2">
          <span className="px-2 py-1 rounded-md bg-red-500/10 text-red-400 text-xs border border-red-500/20">
            {terminal.label}
          </span>
        </div>
      )}
    </div>
  );
}

// --- MAIN PAGE ---
export function DealRoom({ dealAddress, onBack }: { dealAddress: string, onBack: () => void }) {
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const program = useHandoffProgram();

  // Get the active role (Buyer / Seller) from our demo context
  const { signer, viewAs, setViewAs } = useDemoRole();

  // Fetch the deal data from the blockchain, including the retry attempts count
  const { status, deal, error, attempts, refetch } = useDeal(dealAddress);

  // Determine the user's role based on the deal data
  const { role, hint } = useRole(deal);

  // Get the synchronized blockchain time
  const now = useChainNow();

  const [isLoading, setIsLoading] = useState(false);
  const [fileHashInput, setFileHashInput] = useState('');
  const [termsText, setTermsText] = useState(''); // State for the terms text

  // Load the terms from localStorage when the component mounts
  useEffect(() => {
    const savedTerms = localStorage.getItem(`handoff_terms_${dealAddress}`);
    if (savedTerms) setTermsText(savedTerms);
  }, [dealAddress]);

  // --- LOADING & ERROR STATES ---

  // If the RPC node hasn't indexed the new account yet, it will throw an error.
  // We treat this as a loading state, not an error, so the user waits instead of seeing a red screen.
  const isSyncing =
    status === 'loading' ||
    (status === 'error' &&
      !!error?.message &&
      error.message.includes('Account not found'));

  if (isSyncing) {
    return (
      <div className="text-center py-24 text-gray-500">
        <div className="w-10 h-10 mx-auto mb-6 rounded-full border-2 border-gray-800 border-t-[#14F195] animate-spin" />
        <div className="text-gray-300 font-medium">Syncing with blockchain...</div>
        <div className="mt-2 text-xs text-gray-500">
          Waiting for the RPC node to index the escrow account
          {attempts > 0 ? ` · attempt ${attempts}` : ''}
        </div>
      </div>
    );
  }

  if (status === 'error' || !deal) {
    return (
      <div className="text-center py-24">
        <div className="text-red-400">{error?.message || 'Error loading deal.'}</div>
        <button
          onClick={refetch}
          className="mt-6 rounded-xl border border-gray-800 px-5 py-2.5 text-sm font-semibold text-gray-200 bg-[#0A0A0A] hover:border-gray-700 hover:bg-white/[0.04] transition-all duration-200 active:scale-95 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]"
        >
          Retry
        </button>
      </div>
    );
  }

  // --- MAIN UI ---

  // Get the status badge (Initialized, Delivered, etc.)
  const badge = getStatusBadge(deal.status, deal);

  // Get the action panel based on the deal status and user role
  const panel = getPanel({ status: deal.status, role, now, deal });
  const usdcMint = getUsdcMint();

  // The function that executes the action buttons (Accept, Deliver, Approve)
  const executeAction = async (actionId: ActionId, requiresHash: boolean) => {
    if (!signer || !usdcMint) return;

    if (requiresHash && !fileHashInput) {
      alert("Please enter a file hash.");
      return;
    }

    try {
      setIsLoading(true);

      const buyerAta = getAssociatedTokenAddressSync(usdcMint, deal.buyer);
      const sellerAta = getAssociatedTokenAddressSync(usdcMint, deal.seller);
      const escrowVault = getAssociatedTokenAddressSync(usdcMint, deal.address, true);

      let accounts = {
        escrowState: deal.address,
        usdcMint: usdcMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      };

      let tx;

      // Switch statement to handle the specific action
      switch (actionId) {
        case 'accept_deal':
          tx = await program.methods.acceptDeal().accounts({
            ...accounts,
            seller: signer.publicKey,
            escrowVault,
            sellerUsdc: sellerAta,
          }).rpc();
          break;

        case 'deliver_asset':
          const hashParsed = parseFileHash(fileHashInput);
          if (!hashParsed.ok) throw new Error(`Invalid hash: ${hashParsed.reason}`);
          tx = await program.methods.deliverAsset(Array.from(hashParsed.bytes)).accounts({
            seller: signer.publicKey,
            escrowState: deal.address,
          }).rpc();
          break;

        case 'approve_handoff':
          tx = await program.methods.approveHandoff().accounts({
            ...accounts,
            buyer: signer.publicKey,
            escrowVault,
            sellerUsdc: sellerAta,
          }).rpc();
          break;

        case 'cancel_deal':
          tx = await program.methods.cancelDeal().accounts({
            ...accounts,
            buyer: signer.publicKey,
            escrowVault,
            buyerUsdc: buyerAta,
          }).rpc();
          break;

        case 'refund_buyer':
          tx = await program.methods.refundBuyer().accounts({
            ...accounts,
            caller: signer.publicKey,
            escrowVault,
            buyerUsdc: buyerAta,
          }).rpc();
          break;

        case 'auto_release':
          tx = await program.methods.autoRelease().accounts({
            ...accounts,
            caller: signer.publicKey,
            escrowVault,
            sellerUsdc: sellerAta,
          }).rpc();
          break;

        default:
          alert("This action is not fully implemented in the UI yet.");
          return;
      }

      console.log("Success:", tx);
      await refetch(); // Refresh the data from the blockchain after the action
      setFileHashInput('');

    } catch (err: any) {
      console.error(err);
      alert("Transaction failed: " + (err.message || err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <button
        onClick={onBack}
        className="text-gray-400 hover:text-white mb-8 font-medium flex items-center gap-2 rounded-lg px-2 py-1 -ml-2 hover:bg-white/5 transition-all duration-200"
      >
        &larr; Back to Dashboard
      </button>

      {/* Header section with the deal ID and status */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-2">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight">
            Deal <span className="font-mono text-gray-500 font-semibold">#{deal.dealId.toString()}</span>
          </h1>
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${badge.className}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${badge.dotClassName}`}></span>
            {badge.label}
          </span>
        </div>
      </div>

      {/* Warning or hint message */}
      {hint && (
        <div className={`mt-4 p-4 rounded-xl border text-sm ${hint.severity === 'blocking' ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-amber-500/10 border-amber-500/20 text-amber-400'}`}>
          {hint.message}
        </div>
      )}

      {/* Timeline component */}
      <Timeline deal={deal} />

      {/* Vault component showing locked funds */}
      <div className="bg-[#0A0A0A] border border-gray-800 rounded-2xl p-12 text-center relative overflow-hidden shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]">
        {/* Radial glow focal point behind the amount */}
        <div className="absolute inset-0 bg-[radial-gradient(50%_60%_at_50%_45%,rgba(20,241,149,0.12),transparent_70%)] pointer-events-none" />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 rounded-full bg-[#14F195]/10 blur-[90px] pointer-events-none" />

        <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-3 relative">Locked in escrow</p>
        <p className="text-7xl font-bold tracking-tighter relative text-white">
          {formatUsdc(deal.amount)} <span className="text-xl text-gray-500 font-normal">USDC</span>
        </p>
      </div>

      {/* Action Panel */}
      <div className="mt-6 bg-[#0A0A0A] border border-gray-800 rounded-2xl p-6 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]">
        <h2 className="text-lg font-semibold tracking-tight mb-1 text-white">{panel.title}</h2>
        <p className="text-gray-400 text-sm mb-6">{panel.description}</p>

        {panel.countdown && (
          <Countdown deadline={panel.countdown.deadline} label={panel.countdown.label} />
        )}

        {panel.actions.some(a => a.input === 'file_hash') && (
          <div className="mt-6">
            <label className="block text-sm font-medium text-gray-400 mb-2">File Hash (Simulated)</label>
            <input
              type="text"
              placeholder="Paste 32-byte hash..."
              value={fileHashInput}
              onChange={(e) => setFileHashInput(e.target.value)}
              className="w-full bg-black border border-gray-800 rounded-xl px-4 py-3 text-white font-mono text-sm shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)] focus:outline-none focus:border-[#14F195] focus:ring-2 focus:ring-[#14F195]/20 transition-all duration-200"
            />
          </div>
        )}

        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          {panel.actions.map((action) => (
            <button
              key={action.id}
              onClick={() => executeAction(action.id, action.input === 'file_hash')}
              disabled={!action.enabled || isLoading}
              className={`flex-1 h-11 px-5 rounded-xl text-sm font-semibold transition-all duration-200 flex items-center justify-center
                ${action.variant === 'primary'
                  ? 'bg-gradient-to-b from-[#14F195] to-[#0CD783] text-black hover:shadow-[0_0_24px_rgba(20,241,149,0.25)] hover:brightness-110'
                  :
                action.variant === 'danger'
                  ? 'bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 hover:border-red-500/40'
                  :
                  'bg-transparent text-gray-300 border border-gray-800 hover:bg-white/5 hover:border-gray-700'}
                ${(!action.enabled || isLoading) ? 'opacity-40 cursor-not-allowed' : 'active:scale-95'}
              `}
            >
              {isLoading ? 'Processing...' : action.label}
            </button>
          ))}
        </div>
      </div>

      {/* Details Section with Terms */}
      <div className="mt-6 bg-[#0A0A0A] border border-gray-800 rounded-2xl divide-y divide-gray-800/80 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]">

        {/* Display the terms text we saved in localStorage */}
        <div className="flex flex-col p-4 text-sm">
          <span className="text-gray-500 mb-2">Deal Terms</span>
          <span className="text-white whitespace-pre-wrap">{termsText || "No terms provided."}</span>
        </div>

        <div className="flex justify-between p-4 text-sm">
          <span className="text-gray-500">Buyer</span>
          <span className="font-mono text-gray-300">{deal.buyer.toBase58()}</span>
        </div>
        <div className="flex justify-between p-4 text-sm">
          <span className="text-gray-500">Seller</span>
          <span className="font-mono text-gray-300">{deal.seller.toBase58()}</span>
        </div>
      </div>
    </div>
  );
}