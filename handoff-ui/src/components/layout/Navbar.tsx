// ==========================================================
// FILE: components/layout/Navbar.tsx
// PURPOSE: The top navigation bar. Now includes the Demo Role
// Switcher so you can grab the Seller address easily.
// ==========================================================

import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useWallet } from '@solana/wallet-adapter-react';
import { useDemoRole } from '../../lib/demo/DemoRoleContext';
import { CopyableMono } from '../ui';

export function Navbar() {
  const { publicKey } = useWallet();
  const { signer, viewAs, setViewAs } = useDemoRole();

  return (
    <nav className="sticky top-0 z-50 h-16 border-b border-gray-800/80 bg-black">
      <div className="max-w-6xl mx-auto px-6 h-full flex items-center justify-between">
        {/* Logo and Network Badge */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5 cursor-pointer group">
            <div className="w-9 h-9 relative">
              <img
                src="/logo.jpg"
                alt="Handoff Logo"
                className="w-full h-full object-contain mix-blend-screen group-hover:scale-105 transition-transform"
              />
            </div>
            <span className="text-xl text-white font-bold tracking-tight">
              Handoff
            </span>
          </div>
          <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full border border-green-500/30 bg-green-500/10 text-[10px] uppercase tracking-widest text-green-400 font-semibold">
            Devnet
          </span>
        </div>

        {/* Right Side */}
        <div className="flex items-center gap-6">
          {/* Demo Role Switcher (Moved to Navbar) */}
          {publicKey && viewAs && (
            <div className="flex items-center gap-1 bg-[#0A0A0A] border border-gray-800 rounded-lg p-1 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]">
              <span className="text-[10px] uppercase text-[#9945FF] px-2 font-bold tracking-wider">
                Demo
              </span>
              <button
                onClick={() => setViewAs("buyer")}
                className={`px-3 py-1 text-xs rounded-md transition-all duration-200 active:scale-95 ${
                  viewAs === "buyer"
                    ? "bg-white text-black font-semibold"
                    : "text-gray-400 hover:text-white hover:bg-white/5"
                }`}
              >
                Buyer
              </button>
              <button
                onClick={() => setViewAs("seller")}
                className={`px-3 py-1 text-xs rounded-md transition-all duration-200 active:scale-95 ${
                  viewAs === "seller"
                    ? "bg-white text-black font-semibold"
                    : "text-gray-400 hover:text-white hover:bg-white/5"
                }`}
              >
                Seller
              </button>
            </div>
          )}

          {publicKey && signer && (
            <div className="hidden md:flex flex-col items-end">
              <span className="text-[10px] text-gray-500 uppercase tracking-widest">
                Wallet
              </span>
              <CopyableMono value={signer.publicKey.toBase58()} />
            </div>
          )}

          <WalletMultiButton className="!bg-gradient-to-b !from-white !to-gray-200 !text-black hover:!brightness-110 !h-9 !rounded-xl !px-4 !font-semibold !text-sm !transition-all !duration-200 hover:!shadow-[0_0_20px_rgba(255,255,255,0.15)]" />
        </div>
      </div>
    </nav>
  );
}