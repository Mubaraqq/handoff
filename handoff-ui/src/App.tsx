// ==========================================================
// FILE: App.tsx
// PURPOSE: The main router for our UI. It decides which screen
// to show based on whether the user is connected and what they
// are trying to do (Dashboard, Create Deal, Deal Room).
// ==========================================================

import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Navbar } from './components/layout/Navbar';

// Import our three main screens
import { Dashboard } from './pages/Dashboard';
import { CreateDeal } from './pages/CreateDeal';
import { DealRoom } from './pages/DealRoom';

export default function App() {
  const { publicKey } = useWallet();
  
  // State to manage which screen we are on
  const [view, setView] = useState('dashboard');
  const [selectedDealAddress, setSelectedDealAddress] = useState<string | null>(null);

  // If the user hasn't connected a wallet, show the Landing Page
  if (!publicKey) {
    return (
      <div className="min-h-screen flex flex-col bg-black text-white selection:bg-[#14F195]/30 relative overflow-hidden font-sans">
        {/* Subtle grid pattern background for a premium tech aesthetic */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none"></div>

        {/* Soft glowing background orbs (Solana purple and green) */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-[#9945FF]/10 blur-[120px] pointer-events-none"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-[#14F195]/10 blur-[120px] pointer-events-none"></div>

        {/* Landing Page Navbar */}
        <nav className="relative z-10 p-6 flex justify-between items-center max-w-7xl w-full mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 relative">
              <img
                src="/logo.jpg"
                alt="Handoff Logo"
                className="w-full h-full object-contain mix-blend-screen"
              />
            </div>
            <span className="text-2xl text-white font-bold tracking-tight">
              Handoff
            </span>
          </div>
          {/* Connect Wallet button in navbar */}
          <WalletMultiButton className="!bg-gradient-to-b !from-white !to-gray-200 !text-black hover:!brightness-110 !h-10 !rounded-xl !px-6 !font-semibold !text-sm !transition-all !duration-200 hover:!shadow-[0_0_20px_rgba(255,255,255,0.15)]" />
        </nav>

        {/* Main Hero Content */}
        <main className="relative z-10 flex-1 flex flex-col items-center justify-center text-center px-4 pb-20">
          {/* Status Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-gray-800 bg-[#0A0A0A] backdrop-blur-md text-sm text-gray-400 mb-8 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]">
            <span className="w-2 h-2 rounded-full bg-[#14F195] animate-pulse shadow-[0_0_8px_rgba(20,241,149,0.8)]"></span>
            Live on Solana Devnet
          </div>

          {/* Main Headline */}
          <h1 className="text-6xl md:text-8xl font-bold tracking-tighter mb-6 pb-4 leading-[1.1]">
            <span className="bg-clip-text text-transparent bg-gradient-to-b from-white via-white to-gray-500">
              Trustless escrow for <br /> the digital economy.
            </span>
          </h1>

          {/* Sub-headline */}
          <p className="text-xl text-gray-400 max-w-2xl mb-12 leading-relaxed">
            Buy and sell code, APIs, and digital accounts safely. Funds are
            locked in a Solana smart contract until both sides deliver.
          </p>

          {/* Primary CTA Button */}
          <WalletMultiButton className="!bg-gradient-to-b !from-[#14F195] !to-[#0CD783] !text-black !h-14 !px-10 !rounded-xl !font-bold !text-lg transition-all duration-200 hover:brightness-110 hover:scale-[1.02] shadow-[0_0_30px_rgba(20,241,149,0.25)] hover:shadow-[0_0_40px_rgba(20,241,149,0.4)]" />

          {/* Feature List Footer */}
          <div className="mt-20 pt-8 border-t border-gray-800/50 flex flex-wrap justify-center gap-8 text-sm text-gray-500 font-medium">
            <span className="flex items-center gap-2">
              <span className="text-[#14F195]">✓</span> 100% On-Chain Escrow
            </span>
            <span className="flex items-center gap-2">
              <span className="text-[#14F195]">✓</span> Zero Counterparty Risk
            </span>
            <span className="flex items-center gap-2">
              <span className="text-[#14F195]">✓</span> Powered by Solana
            </span>
          </div>
        </main>
      </div>
    );
  }

  // If the user is connected, show the main app shell (Dashboard, Create Deal, Deal Room)
  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-[#14F195]/30">
      <Navbar />
      
      <main className="max-w-6xl mx-auto px-6 py-12">
        {view === 'dashboard' && (
          <Dashboard 
            onCreateDeal={() => setView('create')} 
            onSelectDeal={(address) => {
              setSelectedDealAddress(address);
              setView('deal');
            }} 
          />
        )}
        
        {view === 'create' && (
          <CreateDeal 
            onBack={() => setView('dashboard')} 
            onSuccess={(address) => {
              setSelectedDealAddress(address);
              setView('deal');
            }} 
          />
        )}
        
        {view === 'deal' && selectedDealAddress && (
          <DealRoom 
            dealAddress={selectedDealAddress} 
            onBack={() => setView('dashboard')} 
          />
        )}
      </main>
    </div>
  );
}