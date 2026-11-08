// ==========================================================
// FILE: lib/constants.ts
// PURPOSE: Stores global settings for the app, like timer lengths,
// burner wallet funding limits, and environment variables.
// ==========================================================

import { LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';

// A helper to safely read Vite environment variables from .env
const env = import.meta.env as Record<string, string | undefined>;

// A helper to ensure numeric environment variables are valid positive integers
function positiveIntEnv(name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`${name} must be a positive integer number of seconds, got "${raw}"`);
  }
  return n;
}

// Turns Demo Mode on or off based on .env. 
// This enables the Role Switcher and Burner Wallets.
export const DEMO_MODE = env.VITE_DEMO_MODE === 'true';

// Defines the shape of our time windows
export interface Windows {
  delivery: number;
  inspection: number;
  warranty: number;
  dispute: number;
}

// The time windows for the smart contract. 
// In our demo, we use tiny numbers (like 300 seconds = 5 minutes) so we can test.
// In production, these would be 7 days, 72 hours, 30 days, etc.
export const WINDOWS: Windows = {
  delivery: positiveIntEnv('VITE_DELIVERY_WINDOW', 300),
  inspection: positiveIntEnv('VITE_INSPECTION_WINDOW', 120),
  warranty: positiveIntEnv('VITE_WARRANTY_WINDOW', 300),
  dispute: positiveIntEnv('VITE_DISPUTE_WINDOW', 600),
};

// Because the browser clock might be slightly out of sync with the Solana validator,
// we add a tiny buffer to prevent users from clicking a button a split second too early.
export const CLOCK_SKEW_BUFFER_SECONDS = 5;

// USDC uses 6 decimal places (e.g., 1 USDC = 1,000,000 base units)
export const USDC_DECIMALS = 6;

// Reads the USDC Mint address from .env so the app knows which token to use
export function getUsdcMint(): PublicKey | null {
  const raw = env.VITE_USDC_MINT;
  if (!raw) return null;
  return new PublicKey(raw);
}

// The Genesis Hash for Solana Mainnet. 
// We use this to BLOCK burner wallets on mainnet for security.
export const MAINNET_GENESIS_HASH = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';

// Settings for the Burner Wallet (the fake seller wallet we use for the demo)
export const BURNER = {
  // Below this amount, the UI shows a "low SOL" warning
  minSolLamports: Math.round(0.02 * LAMPORTS_PER_SOL),
  // Below this amount, the burner refuses to sign transactions
  blockSolLamports: Math.round(0.003 * LAMPORTS_PER_SOL),
  // How much SOL we airdrop to it initially
  airdropLamports: 1 * LAMPORTS_PER_SOL,
  // How many times we try to airdrop before giving up
  airdropAttempts: 3,
  // How much SOL the main user sends if the faucet is empty
  walletTopUpLamports: Math.round(0.1 * LAMPORTS_PER_SOL),
  // We want to give the burner 500 USDC to play with, with a minimum of 50
  targetUsdc: 500n * 1_000_000n,
  minUsdc: 50n * 1_000_000n,
  // How often to check the burner's balance (10 seconds)
  pollMs: 10_000,
} as const;