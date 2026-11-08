// ==========================================================
// FILE: lib/demo/burnerWallet.ts
// PURPOSE: Handles the creation, storage, and funding of 
// "burner wallets" used to simulate the Seller and Arbitrator
// during the demo. 
// ==========================================================

import {
  Keypair,
  SystemProgram,
  Transaction,
  VersionedTransaction,
  type Connection,
  type PublicKey,
  type TransactionInstruction,
} from '@solana/web3.js';
import {
  TokenAccountNotFoundError,
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
  createTransferCheckedInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  getMint,
} from '@solana/spl-token';
import { BURNER, DEMO_MODE, MAINNET_GENESIS_HASH } from '../constants';

// The roles that can be played by a burner
export type BurnerRole = 'seller' | 'arbitrator';
export const BURNER_ROLES: readonly BurnerRole[] = ['seller', 'arbitrator'];
// The arbitrator never touches tokens, so it only needs SOL for fees.
export const BURNER_NEEDS_USDC: Record<BurnerRole, boolean> = { seller: true, arbitrator: false };

// A custom error for the burner wallet
export type BurnerErrorCode =
  | 'DEMO_DISABLED' | 'MAINNET_BLOCKED' | 'RPC_UNREACHABLE'
  | 'AIRDROP_RATE_LIMITED' | 'AIRDROP_FAILED'
  | 'WALLET_NOT_CONNECTED' | 'WALLET_FUNDING_FAILED'
  | 'USDC_MINT_MISSING' | 'USDC_FUNDING_FAILED'
  | 'LOW_SOL' | 'UNKNOWN';

export class BurnerError extends Error {
  readonly code: BurnerErrorCode;
  readonly hint: string | undefined;
  readonly cause: unknown;

  constructor(code: BurnerErrorCode, message: string, hint?: string, cause?: unknown) {
    super(message);
    this.name = 'BurnerError';
    this.code = code;
    this.hint = hint;
    this.cause = cause;
  }
}

export function toBurnerError(e: unknown): BurnerError {
  if (e instanceof BurnerError) return e;
  return new BurnerError('UNKNOWN', e instanceof Error ? e.message : String(e), undefined, e);
}

// An interface that matches what the Anchor provider expects for signing
export interface ActiveSigner {
  kind: 'wallet' | 'burner';
  publicKey: PublicKey;
  signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T>;
  signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]>;
}

// Used to fund the burner from the user's Phantom wallet
export interface FundingWallet {
  publicKey: PublicKey;
  sendTransaction: (tx: Transaction, connection: Connection) => Promise<string>;
}

/* -------------------------------------------------------------------------- */
/*  Keypair storage                                                           */
/* -------------------------------------------------------------------------- */

const STORAGE_PREFIX = 'handoff:demo:burner:';
const memoryKeys = new Map<BurnerRole, Uint8Array>();

// Reads a saved burner keypair from localStorage
function readStoredKey(role: BurnerRole): Uint8Array | null {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_PREFIX + role);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length !== 64 || !parsed.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
      return null;
    }
    return Uint8Array.from(parsed as number[]);
  } catch {
    return null;
  }
}

// Saves a burner keypair to localStorage
function writeStoredKey(role: BurnerRole, secretKey: Uint8Array): boolean {
  try {
    globalThis.localStorage?.setItem(STORAGE_PREFIX + role, JSON.stringify(Array.from(secretKey)));
    return globalThis.localStorage !== undefined;
  } catch {
    return false;
  }
}

export interface LoadedBurner {
  keypair: Keypair;
  persisted: boolean;
  created: boolean;
}

// Loads a burner from storage, or creates a new one if it doesn't exist
export function loadOrCreateBurner(role: BurnerRole): LoadedBurner {
  const stored = readStoredKey(role);
  const candidate = stored ?? memoryKeys.get(role) ?? null;
  if (candidate) {
    try {
      return { keypair: Keypair.fromSecretKey(candidate), persisted: stored !== null, created: false };
    } catch {
      // Corrupt key material. Fall through and generate a fresh one.
    }
  }
  const keypair = Keypair.generate();
  const persisted = writeStoredKey(role, keypair.secretKey);
  if (!persisted) memoryKeys.set(role, keypair.secretKey);
  return { keypair, persisted, created: true };
}

// Deletes a burner from storage
export function clearBurner(role: BurnerRole): void {
  memoryKeys.delete(role);
  try {
    globalThis.localStorage?.removeItem(STORAGE_PREFIX + role);
  } catch {
    // Nothing to clear.
  }
}

/* -------------------------------------------------------------------------- */
/*  Signer                                                                    */
/* -------------------------------------------------------------------------- */

// Wraps a raw Keypair into the ActiveSigner interface
export function createBurnerSigner(keypair: Keypair, getLamports: () => number | null): ActiveSigner {
  const assertCanPayFees = (): void => {
    const lamports = getLamports();
    if (lamports !== null && lamports < BURNER.blockSolLamports) {
      throw new BurnerError('LOW_SOL', 'The demo wallet is out of SOL for transaction fees.', `Use "Top up" or send devnet SOL to ${keypair.publicKey.toBase58()}.`);
    }
  };

  const signOne = <T extends Transaction | VersionedTransaction>(tx: T): T => {
    if (tx instanceof VersionedTransaction) tx.sign([keypair]);
    else (tx as Transaction).partialSign(keypair);
    return tx;
  };

  return {
    kind: 'burner',
    publicKey: keypair.publicKey,
    async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
      assertCanPayFees();
      return signOne(tx);
    },
    async signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> {
      assertCanPayFees();
      return txs.map(signOne);
    },
  };
}

/* -------------------------------------------------------------------------- */
/*  Guards                                                                    */
/* -------------------------------------------------------------------------- */

export function assertDemoEnabled(): void {
  if (!DEMO_MODE) {
    throw new BurnerError('DEMO_DISABLED', 'Demo mode is off.', 'Set VITE_DEMO_MODE=true in your .env file.');
  }
}

// Prevents burner wallets from being used on Mainnet
export async function assertNotMainnet(connection: Connection): Promise<void> {
  let genesis: string;
  try {
    genesis = await connection.getGenesisHash();
  } catch (e) {
    throw new BurnerError('RPC_UNREACHABLE', 'Could not reach the Solana RPC endpoint.', undefined, e);
  }
  if (genesis === MAINNET_GENESIS_HASH) {
    throw new BurnerError('MAINNET_BLOCKED', 'Demo wallets are disabled on mainnet-beta.', 'Point your RPC URL at devnet or a local validator.');
  }
}

/* -------------------------------------------------------------------------- */
/*  Funding helpers                                                           */
/* -------------------------------------------------------------------------- */

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function isRateLimit(e: unknown): boolean {
  const text = e instanceof Error ? e.message : String(e);
  return /429|rate.?limit|too many|airdrop limit|limit exceeded/i.test(text);
}

interface BlockhashInfo {
  blockhash: string;
  lastValidBlockHeight: number;
}

async function confirm(connection: Connection, signature: string, latest: BlockhashInfo): Promise<void> {
  const res = await connection.confirmTransaction({ signature, ...latest }, 'confirmed');
  if (res.value.err) throw new Error(`Transaction failed: ${JSON.stringify(res.value.err)}`);
}

async function sendFromWallet(
  connection: Connection,
  wallet: FundingWallet,
  instructions: TransactionInstruction[],
): Promise<void> {
  const latest = await connection.getLatestBlockhash('confirmed');
  const tx = new Transaction({ feePayer: wallet.publicKey, ...latest }).add(...instructions);
  const signature = await wallet.sendTransaction(tx, connection);
  await confirm(connection, signature, latest);
}

/* -------------------------------------------------------------------------- */
/*  SOL                                                                       */
/* -------------------------------------------------------------------------- */

export type SolFundingMethod = 'already-funded' | 'airdrop' | 'wallet-transfer';

export interface EnsureSolOptions {
  connection: Connection;
  burner: PublicKey;
  fundingWallet?: FundingWallet | null;
  force?: boolean;
}

// Ensures the burner has enough SOL to pay for transactions
export async function ensureBurnerSol(
  opts: EnsureSolOptions,
): Promise<{ method: SolFundingMethod; lamports: number }> {
  const { connection, burner, fundingWallet, force = false } = opts;
  const before = await connection.getBalance(burner, 'confirmed');
  if (!force && before >= BURNER.minSolLamports) return { method: 'already-funded', lamports: before };

  let lastError: unknown;
  for (let attempt = 0; attempt < BURNER.airdropAttempts; attempt++) {
    try {
      const signature = await connection.requestAirdrop(burner, BURNER.airdropLamports);
      await confirm(connection, signature, await connection.getLatestBlockhash('confirmed'));
      const lamports = await connection.getBalance(burner, 'confirmed');
      if (lamports > before) return { method: 'airdrop', lamports };
      lastError = new Error('Airdrop confirmed but the balance did not change.');
    } catch (e) {
      lastError = e;
    }
    if (attempt < BURNER.airdropAttempts - 1) await sleep(1000 * 2 ** attempt);
  }

  if (fundingWallet) {
    try {
      const walletBalance = await connection.getBalance(fundingWallet.publicKey, 'confirmed');
      if (walletBalance < BURNER.walletTopUpLamports + 10_000) {
        throw new BurnerError('WALLET_FUNDING_FAILED', 'Your wallet does not have enough SOL to fund the demo wallet.', 'Get devnet SOL from https://faucet.solana.com.');
      }
      await sendFromWallet(connection, fundingWallet, [
        SystemProgram.transfer({
          fromPubkey: fundingWallet.publicKey,
          toPubkey: burner,
          lamports: BURNER.walletTopUpLamports,
        }),
      ]);
      return { method: 'wallet-transfer', lamports: await connection.getBalance(burner, 'confirmed') };
    } catch (e) {
      if (e instanceof BurnerError) throw e;
      throw new BurnerError('WALLET_FUNDING_FAILED', 'Sending SOL from your wallet to the demo wallet failed.', undefined, e);
    }
  }

  const limited = isRateLimit(lastError);
  throw new BurnerError(
    limited ? 'AIRDROP_RATE_LIMITED' : 'AIRDROP_FAILED',
    limited ? 'The devnet faucet is rate-limited right now.' : 'Could not airdrop SOL to the demo wallet.',
    `Connect your wallet to fund it from there, or send devnet SOL to ${burner.toBase58()} (https://faucet.solana.com).`,
    lastError,
  );
}

/* -------------------------------------------------------------------------- */
/*  USDC                                                                      */
/* -------------------------------------------------------------------------- */

export type UsdcFundingMethod = 'already-funded' | 'minted' | 'transferred';

export async function getUsdcBalance(connection: Connection, owner: PublicKey, mint: PublicKey): Promise<bigint> {
  const ata = getAssociatedTokenAddressSync(mint, owner);
  try {
    return (await getAccount(connection, ata, 'confirmed')).amount;
  } catch (e) {
    if (e instanceof TokenAccountNotFoundError) return 0n;
    throw e;
  }
}

export interface EnsureUsdcOptions {
  connection: Connection;
  burner: PublicKey;
  mint: PublicKey;
  fundingWallet?: FundingWallet | null;
}

// Ensures the burner has enough USDC to test the escrow
export async function ensureBurnerUsdc(
  opts: EnsureUsdcOptions,
): Promise<{ method: UsdcFundingMethod; balance: bigint }> {
  const { connection, burner, mint, fundingWallet } = opts;
  const current = await getUsdcBalance(connection, burner, mint);
  if (current >= BURNER.minUsdc) return { method: 'already-funded', balance: current };

  if (!fundingWallet) {
    throw new BurnerError('WALLET_NOT_CONNECTED', 'Connect your wallet so test USDC can be sent to the demo wallet.');
  }

  const mintInfo = await getMint(connection, mint, 'confirmed');
  const burnerAta = getAssociatedTokenAddressSync(mint, burner);
  const need = BURNER.targetUsdc - current;
  const createAta = createAssociatedTokenAccountIdempotentInstruction(fundingWallet.publicKey, burnerAta, burner, mint);

  if (mintInfo.mintAuthority?.equals(fundingWallet.publicKey)) {
    await sendFromWallet(connection, fundingWallet, [
      createAta,
      createMintToInstruction(mint, burnerAta, fundingWallet.publicKey, need),
    ]);
    return { method: 'minted', balance: await getUsdcBalance(connection, burner, mint) };
  }

  const walletAta = getAssociatedTokenAddressSync(mint, fundingWallet.publicKey);
  const walletBalance = await getUsdcBalance(connection, fundingWallet.publicKey, mint);
  const half = walletBalance / 2n;
  const amount = half < need ? half : need;

  if (current + amount < BURNER.minUsdc) {
    const authority = mintInfo.mintAuthority ? `the mint authority (${mintInfo.mintAuthority.toBase58()})` : 'a mint authority (this mint has none, so you need an existing USDC holder)';
    throw new BurnerError('USDC_FUNDING_FAILED', 'Could not give the demo wallet test USDC.', `Mint test USDC to ${burnerAta.toBase58()} using ${authority}.`);
  }

  await sendFromWallet(connection, fundingWallet, [
    createAta,
    createTransferCheckedInstruction(walletAta, mint, burnerAta, fundingWallet.publicKey, amount, mintInfo.decimals),
  ]);
  return { method: 'transferred', balance: await getUsdcBalance(connection, burner, mint) };
}

/* -------------------------------------------------------------------------- */
/*  Balances                                                                  */
/* -------------------------------------------------------------------------- */

export interface BurnerBalances {
  lamports: number;
  usdc: bigint | null;
}

export async function readBurnerBalances(
  connection: Connection,
  burner: PublicKey,
  mint: PublicKey | null,
): Promise<BurnerBalances> {
  const [lamports, usdc] = await Promise.all([
    connection.getBalance(burner, 'confirmed'),
    mint ? getUsdcBalance(connection, burner, mint) : Promise.resolve(null),
  ]);
  return { lamports, usdc };
}