// ==========================================================
// FILE: lib/demo/DemoRoleContext.tsx
// PURPOSE: A React Context that handles switching between 
// the real wallet and the demo burner wallets (Seller/Arbitrator).
// It manages the creation, funding, and signing of the burner wallets.
// ==========================================================

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';

import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import type { Keypair, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';

import { BURNER, DEMO_MODE, getUsdcMint } from '../constants';

import {
  BURNER_NEEDS_USDC,
  BurnerError,
  assertDemoEnabled,
  assertNotMainnet,
  clearBurner,
  createBurnerSigner,
  ensureBurnerSol,
  ensureBurnerUsdc,
  loadOrCreateBurner,
  readBurnerBalances,
  toBurnerError,
  type ActiveSigner,
  type BurnerRole,
  type FundingWallet,
} from './burnerWallet';

// The available roles to view the app as
export type ViewAs = 'buyer' | BurnerRole;

export type BurnerStatus = 'idle' | 'preparing' | 'ready' | 'low_sol' | 'error';

export interface BurnerState {
  status: BurnerStatus;
  address: PublicKey | null;
  lamports: number | null;
  usdc: bigint | null;
  persisted: boolean;
  error: BurnerError | null;
  usdcWarning: BurnerError | null;
}

export interface DemoRoleContextValue {
  demoEnabled: boolean;
  viewAs: ViewAs;
  setViewAs: (next: ViewAs) => Promise<void>;
  signer: ActiveSigner | null;
  walletSigner: ActiveSigner | null;
  burners: Record<BurnerRole, BurnerState>;
  retryBurner: (role: BurnerRole) => Promise<void>;
  topUpBurner: (role: BurnerRole) => Promise<void>;
  refreshBurner: (role: BurnerRole) => Promise<void>;
  resetBurner: (role: BurnerRole) => Promise<void>;
}

// Default state before the burner is created
const IDLE_BURNER: BurnerState = {
  status: 'idle', address: null, lamports: null, usdc: null, persisted: true, error: null, usdcWarning: null,
};

const DemoRoleContext = createContext<DemoRoleContextValue | null>(null);

// Errors that mean the whole demo cannot run (like no demo mode, or on Mainnet)
const FATAL_CODES: ReadonlySet<string> = new Set(['DEMO_DISABLED', 'MAINNET_BLOCKED', 'RPC_UNREACHABLE']);

export function DemoRoleProvider({ children }: PropsWithChildren) {
  const { connection } = useConnection();
  const wallet = useWallet();

  // State to track which role the user is currently viewing
  const [viewAs, setViewAsState] = useState<ViewAs>('buyer');
  
  // State to hold the status, balance, and errors for the burner wallets
  const [burners, setBurners] = useState<Record<BurnerRole, BurnerState>>({
    seller: IDLE_BURNER,
    arbitrator: IDLE_BURNER,
  });
  
  // State to hold the actual signing functions for the burners
  const [signers, setSigners] = useState<Partial<Record<BurnerRole, ActiveSigner>>>({});

  // Refs to hold the keypairs, lamports, and setup promises without triggering re-renders
  const keypairs = useRef<Partial<Record<BurnerRole, Keypair>>>({});
  const lamportsRef = useRef<Record<BurnerRole, number | null>>({ seller: null, arbitrator: null });
  const inflight = useRef<Partial<Record<BurnerRole, Promise<void>>>>({});
  const mounted = useRef(true);
  const walletRef = useRef(wallet);
  walletRef.current = wallet;

  // Handle unmounting to prevent state updates on unmounted components
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // Helper to update a specific burner's state safely
  const patch = useCallback((role: BurnerRole, partial: Partial<BurnerState>) => {
    if (!mounted.current) return;
    setBurners((prev) => ({ ...prev, [role]: { ...prev[role], ...partial } }));
  }, []);

  // Wraps the user's Phantom wallet so we can use it to fund the burner wallets
  const getFundingWallet = useCallback((): FundingWallet | null => {
    const { publicKey } = walletRef.current;
    if (!publicKey) return null;
    return {
      publicKey,
      sendTransaction: (tx, conn) => walletRef.current.sendTransaction(tx, conn),
    };
  }, []);

  // The main setup function for a burner wallet.
  const prepare = useCallback(
    (role: BurnerRole, opts: { forceSol?: boolean } = {}): Promise<void> => {
      // Prevent running setup twice at the same time for the same role
      const existing = inflight.current[role];
      if (existing) return existing;

      const run = (async () => {
        patch(role, { status: 'preparing', error: null, usdcWarning: null });
        try {
          // 1. Make sure demo mode is on and we are not on Mainnet
          assertDemoEnabled();
          await assertNotMainnet(connection);

          // 2. Load or create the keypair
          const loaded = loadOrCreateBurner(role);
          const keypair = loaded.keypair;
          keypairs.current[role] = keypair;
          patch(role, { address: keypair.publicKey, persisted: loaded.persisted });
          
          // 3. Create the signer function for this keypair
          setSigners((prev) =>
            prev[role] ? prev : { ...prev, [role]: createBurnerSigner(keypair, () => lamportsRef.current[role]) },
          );

          // 4. Airdrop SOL for transaction fees
          await ensureBurnerSol({
            connection, burner: keypair.publicKey, fundingWallet: getFundingWallet(), force: opts.forceSol ?? false,
          });

          // 5. Airdrop USDC if the role needs it (like the Seller)
          let mint: PublicKey | null = null;
          let usdcWarning: BurnerError | null = null;
          if (BURNER_NEEDS_USDC[role]) {
            try {
              mint = getUsdcMint();
              if (!mint) throw new BurnerError('USDC_MINT_MISSING', 'VITE_USDC_MINT is not set.');
              await ensureBurnerUsdc({ connection, burner: keypair.publicKey, mint, fundingWallet: getFundingWallet() });
            } catch (e) {
              usdcWarning = toBurnerError(e);
            }
          }

          // 6. Read final balances and mark as ready
          const balances = await readBurnerBalances(connection, keypair.publicKey, mint);
          lamportsRef.current[role] = balances.lamports;
          patch(role, {
            status: balances.lamports < BURNER.minSolLamports ? 'low_sol' : 'ready',
            lamports: balances.lamports, usdc: balances.usdc, usdcWarning, error: null,
          });
        } catch (e) {
          // Handle errors gracefully
          const error = toBurnerError(e);
          const keypair = keypairs.current[role];
          let lamports = lamportsRef.current[role];
          
          if (!FATAL_CODES.has(error.code) && keypair) {
            try {
              lamports = await connection.getBalance(keypair.publicKey, 'confirmed');
              lamportsRef.current[role] = lamports;
            } catch { /* Keep last known value */ }
          }
          
          const usable = !FATAL_CODES.has(error.code) && lamports !== null && lamports >= BURNER.blockSolLamports;
          patch(role, { status: usable ? 'low_sol' : 'error', lamports, error });
        }
      })().finally(() => { delete inflight.current[role]; });

      inflight.current[role] = run;
      return run;
    },
    [connection, getFundingWallet, patch],
  );

  // Periodically refresh the burner's balance so the UI knows if it's low on SOL
  const refreshBurner = useCallback(
    async (role: BurnerRole): Promise<void> => {
      const keypair = keypairs.current[role];
      if (!keypair) return;
      try {
        const mint = BURNER_NEEDS_USDC[role] ? getUsdcMint() : null;
        const balances = await readBurnerBalances(connection, keypair.publicKey, mint);
        lamportsRef.current[role] = balances.lamports;
        if (!mounted.current) return;
        setBurners((prev) => {
          const current = prev[role];
          const status: BurnerStatus =
            current.status === 'ready' || current.status === 'low_sol'
              ? balances.lamports < BURNER.minSolLamports ? 'low_sol' : 'ready'
              : current.status;
          return {
            ...prev, [role]: { ...current, status, lamports: balances.lamports, usdc: balances.usdc ?? current.usdc },
          };
        });
      } catch { /* Failed poll is fine, try again next time */ }
    },
    [connection],
  );

  // Function to switch roles (Buyer -> Seller -> Arbitrator)
  const setViewAs = useCallback(
    async (next: ViewAs): Promise<void> => {
      if (next !== 'buyer' && !DEMO_MODE) throw new BurnerError('DEMO_DISABLED', 'Demo mode is off.');
      setViewAsState(next);
      if (next !== 'buyer') await prepare(next);
    },
    [prepare],
  );

  const retryBurner = useCallback((role: BurnerRole) => prepare(role), [prepare]);
  const topUpBurner = useCallback((role: BurnerRole) => prepare(role, { forceSol: true }), [prepare]);

  // Completely deletes the burner wallet and creates a new one
  const resetBurner = useCallback(
    async (role: BurnerRole): Promise<void> => {
      await inflight.current[role];
      clearBurner(role);
      delete keypairs.current[role];
      lamportsRef.current[role] = null;
      setSigners((prev) => { const next = { ...prev }; delete next[role]; return next; });
      patch(role, IDLE_BURNER);
      await prepare(role);
    },
    [patch, prepare],
  );

  // Keep the active burner's balance fresh
  useEffect(() => {
    if (viewAs === 'buyer') return;
    const id = setInterval(() => void refreshBurner(viewAs), BURNER.pollMs);
    return () => clearInterval(id);
  }, [viewAs, refreshBurner]);

   // Wrap the user's Phantom wallet as a signer
  const walletSigner = useMemo<ActiveSigner | null>(() => {
    if (!wallet.publicKey || !wallet.signTransaction) return null;
    return wallet as unknown as ActiveSigner;
  }, [wallet]);

  // The active signer is either the Phantom wallet (if viewing as buyer) or the burner wallet
  const signer = useMemo<ActiveSigner | null>(() => {
    if (viewAs === 'buyer') return walletSigner;
    const status = burners[viewAs].status;
    if (status !== 'ready' && status !== 'low_sol') return null;
    return signers[viewAs] ?? null;
  }, [viewAs, walletSigner, burners, signers]);

  // Bundle everything into the context value
  const value = useMemo<DemoRoleContextValue>(
    () => ({
      demoEnabled: DEMO_MODE, viewAs, setViewAs, signer, walletSigner, burners,
      retryBurner, topUpBurner, refreshBurner, resetBurner,
    }),
    [viewAs, setViewAs, signer, walletSigner, burners, retryBurner, topUpBurner, refreshBurner, resetBurner],
  );

  return <DemoRoleContext.Provider value={value}>{children}</DemoRoleContext.Provider>;
}

// Custom hook to use the context
export function useDemoRole(): DemoRoleContextValue {
  const value = useContext(DemoRoleContext);
  if (!value) throw new Error('useDemoRole must be used inside <DemoRoleProvider>.');
  return value;
}