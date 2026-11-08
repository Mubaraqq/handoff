// ==========================================================
// FILE: hooks/useRole.ts
// PURPOSE: Determines the current user's role (Buyer, Seller, 
// Arbitrator, or Observer) based on the active wallet and the deal.
// Also provides warning hints if the user's wallet doesn't match 
// the role they are trying to view in Demo Mode.
// ==========================================================

import { useMemo } from 'react';
import type { PublicKey } from '@solana/web3.js';
import { DEMO_MODE } from '../lib/constants';
import type { ActiveSigner } from '../lib/demo/burnerWallet';
import { useDemoRole, type ViewAs } from '../lib/demo/DemoRoleContext';
import { shortAddress } from '../lib/format';
import type { Deal, Role } from '../types/deal';

// Pure function to determine the role based on the addresses
export function deriveRole(deal: Deal | null, who: PublicKey | null): Role {
  if (!deal || !who) return 'observer';
  if (who.equals(deal.buyer)) return 'buyer';
  if (who.equals(deal.seller)) return 'seller';
  if (who.equals(deal.arbitrator)) return 'arbitrator';
  return 'observer';
}

export type RoleHintCode =
  | 'NO_WALLET'
  | 'BURNER_PREPARING'
  | 'BURNER_ERROR'
  | 'DEMO_ADDRESS_MISMATCH'
  | 'LOW_SOL';

export interface RoleHint {
  code: RoleHintCode;
  severity: 'blocking' | 'warning';
  message: string;
  detail?: string;
}

export interface UseRoleResult {
  role: Role;
  signer: ActiveSigner | null;
  viewAs: ViewAs | null;
  hint: RoleHint | null;
}

export function useRole(deal: Deal | null): UseRoleResult {
  const demo = useDemoRole();
  const { signer, viewAs, burners } = demo;

  // Figure out who we are
  const role = deriveRole(deal, signer?.publicKey ?? null);

  // Generate hints if something is wrong (like using the wrong wallet)
  const hint = useMemo<RoleHint | null>(() => {
    if (!signer) {
      if (viewAs === 'buyer') {
        return { code: 'NO_WALLET', severity: 'blocking', message: 'Connect a wallet to act on this deal.' };
      }
      const burner = burners[viewAs];
      if (burner.status === 'idle' || burner.status === 'preparing') {
        return { code: 'BURNER_PREPARING', severity: 'blocking', message: 'Setting up the demo wallet...' };
      }
      const base = {
        code: 'BURNER_ERROR' as const,
        severity: 'blocking' as const,
        message: burner.error?.message ?? 'The demo wallet is unavailable.',
      };
      return burner.error?.hint ? { ...base, detail: burner.error.hint } : base;
    }

    // If we are in Demo Mode and viewing as Seller/Arbitrator, but the Deal 
    // was created with a different address, warn the user.
    if (DEMO_MODE && deal && role !== viewAs) {
      const expected = viewAs === 'buyer' ? 'connected wallet' : `demo ${viewAs} wallet`;
      return {
        code: 'DEMO_ADDRESS_MISMATCH',
        severity: 'blocking',
        message: `The ${expected} (${shortAddress(signer.publicKey)}) is not this deal's ${viewAs}.`,
        detail: `Create the deal with the ${expected} address as the ${viewAs}.`,
      };
    }

    // Warn if the burner wallet is running low on SOL for gas
    if (viewAs !== 'buyer' && burners[viewAs].status === 'low_sol') {
      return {
        code: 'LOW_SOL',
        severity: 'warning',
        message: 'The demo wallet is low on SOL. Top it up to avoid failed transactions.',
      };
    }

    return null;
  }, [signer, viewAs, burners, deal, role]);

  return { role, signer, viewAs: DEMO_MODE ? viewAs : null, hint };
}