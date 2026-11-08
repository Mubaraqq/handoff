// ==========================================================
// FILE: hooks/useDeal.ts
// PURPOSE: Fetches a single deal from the blockchain using
// Anchor's native account fetching, with a built-in retry
// loop to handle RPC lag.
// ==========================================================

import { useCallback, useEffect, useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useHandoffProgram } from './useHandoffProgram';
import { mapEscrow } from '../lib/program/escrowMapper';
import type { Deal } from '../types/deal';

const MAX_RETRIES = 15;
const RETRY_DELAY = 2000; // 2 seconds

export function useDeal(dealAddress?: string | PublicKey | null) {
  const program = useHandoffProgram();
  
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [deal, setDeal] = useState<Deal | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [attempts, setAttempts] = useState(0);

  const fetchDeal = useCallback(async () => {
    if (!dealAddress || !program) return;

    setStatus('loading');
    setError(null);
    setAttempts(0);

    const address = typeof dealAddress === 'string' ? new PublicKey(dealAddress) : dealAddress;

    for (let i = 0; i < MAX_RETRIES; i++) {
      setAttempts(i + 1);
      try {
        // Anchor's native fetch handles all the byte decoding perfectly
        const raw = await program.account.escrowState.fetch(address);
        
        // If it succeeds, map the data and stop retrying
        setDeal(mapEscrow(address, raw as any));
        setStatus('ready');
        return;
      } catch (e: any) {
        console.log(`Attempt ${i + 1} failed:`, e.message);
        // If it's not the last attempt, wait and try again
        if (i < MAX_RETRIES - 1) {
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
        } else {
          // If we run out of retries, set the error
          setError(new Error("Failed to load deal after multiple attempts. It may not be indexed yet."));
          setStatus('error');
        }
      }
    }
  }, [dealAddress, program]);

  useEffect(() => {
    fetchDeal();
  }, [fetchDeal]);

  return { status, deal, error, attempts, refetch: fetchDeal };
}