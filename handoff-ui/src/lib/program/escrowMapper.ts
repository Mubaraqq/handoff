// ==========================================================
// FILE: lib/program/escrowMapper.ts
// PURPOSE: Translates the raw, messy data structure returned 
// by the Solana blockchain into the clean "Deal" object our UI uses.
// ==========================================================

import type { BN } from '@coral-xyz/anchor';
import type { PublicKey } from '@solana/web3.js';
import type { Deal, DealStatus, Tier } from '../../types/deal';

// Anchor decodes Rust enums as objects like `{ basic: {} }`
type EnumLike = Record<string, unknown>;

// The exact shape of the data coming from the blockchain
export interface RawEscrowState {
  buyer: PublicKey;
  seller: PublicKey;
  arbitrator: PublicKey;
  mint: PublicKey;
  dealId: BN;
  tier: EnumLike | number;
  amount: BN;
  buyerDeposit: BN;
  sellerDeposit: BN;
  priceReleased: boolean;
  checklistHash: number[];
  fileHash: number[];
  status: EnumLike;
  deliveryDeadline: BN;
  inspectionDeadline: BN;
  warrantyDeadline: BN;
  disputedAt: BN;
  bump: number;
}

// Custom error if the blockchain sends us data we don't understand
export class DealDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DealDecodeError';
  }
}

const STATUSES: readonly DealStatus[] = [
  'initialized', 'accepted', 'delivered', 'completed', 'disputed', 'closed',
];

// Helper to extract the name of the enum variant (e.g., { basic: {} } -> "basic")
function enumKey(value: EnumLike): string {
  const key = Object.keys(value)[0];
  if (key === undefined) throw new DealDecodeError('Empty enum value in account data');
  return key.toLowerCase();
}

// Parses the deal status
function parseStatus(raw: EnumLike): DealStatus {
  const key = enumKey(raw);
  const match = STATUSES.find((s) => s === key);
  if (!match) throw new DealDecodeError(`Unknown deal status "${key}"`);
  return match;
}

// Parses the tier (Basic or Advanced)
function parseTier(raw: EnumLike | number): Tier {
  if (typeof raw === 'number') {
    if (raw === 0) return 'basic';
    if (raw === 1) return 'advanced';
    throw new DealDecodeError(`Unknown tier value ${raw}`);
  }
  const key = enumKey(raw);
  if (key === 'basic' || key === 'advanced') return key;
  throw new DealDecodeError(`Unknown tier "${key}"`);
}

// Converts Anchor's BigNumber (BN) into a native BigInt
function toBigInt(bn: BN): bigint {
  return BigInt(bn.toString());
}

// Converts a BN timestamp into a standard number
function toSeconds(bn: BN): number {
  const n = Number(bn.toString());
  if (!Number.isSafeInteger(n)) throw new DealDecodeError('Timestamp out of range');
  return n;
}

// Converts an array of numbers into a 32-byte Uint8Array
function toHash(bytes: number[], name: string): Uint8Array {
  if (bytes.length !== 32) throw new DealDecodeError(`${name} must be 32 bytes, got ${bytes.length}`);
  return Uint8Array.from(bytes);
}

// The main function that maps the raw data to the UI data
export function mapEscrow(address: PublicKey, raw: RawEscrowState): Deal {
  return {
    address,
    buyer: raw.buyer,
    seller: raw.seller,
    arbitrator: raw.arbitrator,
    mint: raw.mint,
    dealId: toBigInt(raw.dealId),
    tier: parseTier(raw.tier),
    amount: toBigInt(raw.amount),
    buyerDeposit: toBigInt(raw.buyerDeposit),
    sellerDeposit: toBigInt(raw.sellerDeposit),
    priceReleased: raw.priceReleased,
    checklistHash: toHash(raw.checklistHash, 'checklistHash'),
    fileHash: toHash(raw.fileHash, 'fileHash'),
    status: parseStatus(raw.status),
    deliveryDeadline: toSeconds(raw.deliveryDeadline),
    inspectionDeadline: toSeconds(raw.inspectionDeadline),
    warrantyDeadline: toSeconds(raw.warrantyDeadline),
    disputedAt: toSeconds(raw.disputedAt),
  };
}