// ==========================================================
// FILE: hooks/useChainNow.ts
// PURPOSE: Fetches the current time from the Solana blockchain
// and syncs it with the browser clock. This prevents users from 
// clicking buttons too early if their local clock is wrong.
// ==========================================================

import { useEffect, useRef, useState } from 'react';
import { useConnection } from '@solana/wallet-adapter-react';

// How often we re-sync with the blockchain clock (every 60 seconds)
const RESYNC_MS = 60_000;

// Gets the current browser time in unix seconds
const wallClock = (): number => Math.floor(Date.now() / 1000);

/**
 * Returns the current unix timestamp, corrected to match the Solana cluster's clock.
 */
export function useChainNow(): number {
  const { connection } = useConnection();
  
  // We store the difference between the blockchain time and the browser time
  const offset = useRef(0);
  
  // This state triggers a re-render every second to update countdown timers
  const [now, setNow] = useState(wallClock);

  useEffect(() => {
    let cancelled = false;

    // Function to fetch the time from the latest block
    const sync = async (): Promise<void> => {
      try {
        const slot = await connection.getSlot('confirmed');
        const blockTime = await connection.getBlockTime(slot);
        // If we got a valid time, calculate the offset
        if (!cancelled && blockTime !== null) {
          offset.current = blockTime - wallClock();
        }
      } catch {
        // If the RPC fails, we just keep using the previous offset
      }
    };

    // Run sync immediately on load
    void sync();
    
    // Set up intervals
    const syncId = setInterval(() => void sync(), RESYNC_MS);
    const tickId = setInterval(() => setNow(wallClock() + offset.current), 1000);

    return () => {
      cancelled = true;
      clearInterval(syncId);
      clearInterval(tickId);
    };
  }, [connection]);

  return now;
}