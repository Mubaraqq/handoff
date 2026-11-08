// ==========================================================
// FILE: lib/format.ts
// PURPOSE: Helper functions to format data for the UI.
// Blockchains use raw numbers (like 100000000), but humans
// need to read them as "100.00 USDC".
// ==========================================================

import type { PublicKey } from '@solana/web3.js';
import { USDC_DECIMALS } from './constants';

// 10^6 = 1,000,000. We use this to shift decimal places.
const SCALE = 10n ** BigInt(USDC_DECIMALS);

/**
 * Formats a raw blockchain number into a human-readable USDC string.
 * Example: 100_500_000n becomes "100.5"
 */
export function formatUsdc(base: bigint, maxFractionDigits = 2): string {
  const negative = base < 0n;
  const abs = negative ? -base : base;
  
  // Get the whole number (e.g., 100)
  const whole = abs / SCALE;
  
  // Get the decimal part, pad it with zeros, and trim trailing zeros
  const fraction = (abs % SCALE)
    .toString()
    .padStart(USDC_DECIMALS, '0')
    .slice(0, maxFractionDigits)
    .replace(/0+$/, '');
    
  // Add commas for thousands (e.g., 1,000)
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  
  return `${negative ? '-' : ''}${wholeStr}${fraction ? `.${fraction}` : ''}`;
}

/**
 * Truncates a long Solana address so it fits on screen.
 * Example: 8CtdyqtzBd597eDz9PTZHuuT62vvLc6YXdXjVkHnboqj becomes "8Ctd...boqj"
 */
export function shortAddress(address: PublicKey | string, chars = 4): string {
  const s = typeof address === 'string' ? address : address.toBase58();
  return s.length <= chars * 2 + 1 ? s : `${s.slice(0, chars)}...${s.slice(-chars)}`;
}

/**
 * Converts a Uint8Array (raw bytes) into a hex string.
 * Example: [255, 0, 10] becomes "ff000a"
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Checks if a hash is just all zeros.
 * The smart contract rejects empty hashes, so the UI should too.
 */
export function isZeroHash(bytes: Uint8Array): boolean {
  return bytes.every((b) => b === 0);
}

// The result of trying to parse a file hash string
export type ParsedHash =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; reason: 'length' | 'characters' | 'zero' };

/**
 * Takes a string typed by the user (like "a3f5...") and converts it
 * into the 32-byte array the smart contract expects.
 */
export function parseFileHash(input: string): ParsedHash {
  // Remove any spaces or "0x" prefix
  const cleaned = input.trim().replace(/^0x/i, '');
  
  // A valid Solana hash must be exactly 64 hex characters (32 bytes)
  if (cleaned.length !== 64) return { ok: false, reason: 'length' };
  if (!/^[0-9a-fA-F]+$/.test(cleaned)) return { ok: false, reason: 'characters' };
  
  // Convert hex string to bytes
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(cleaned.slice(i * 2, i * 2 + 2), 16);
  }
  
  // Reject empty hashes
  if (isZeroHash(bytes)) return { ok: false, reason: 'zero' };
  
  return { ok: true, bytes };
}