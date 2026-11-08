// ==========================================================
// FILE: hooks/useHandoffProgram.ts
// PURPOSE: Connects our app to the Handoff smart contract.
// It automatically uses whichever wallet is currently active 
// (your Phantom wallet or the demo burner wallet).
// ==========================================================

import { useMemo } from 'react';
import { AnchorProvider, Program, type Idl } from '@coral-xyz/anchor';
import { useConnection } from '@solana/wallet-adapter-react';
import { PublicKey, type Transaction, type VersionedTransaction } from '@solana/web3.js';
import { useDemoRole } from '../lib/demo/DemoRoleContext';
// Import the IDL we copied into the folder
import idlJson from '../lib/program/handoff.json';

// A dummy wallet for when the user is disconnected. 
// It allows us to READ data from the blockchain, but it will throw an 
// error if we try to sign a transaction without a real wallet.
const READ_ONLY_WALLET = {
  publicKey: PublicKey.default,
  signTransaction: <T extends Transaction | VersionedTransaction>(_tx: T): Promise<T> =>
    Promise.reject(new Error('Connect a wallet to send transactions.')),
  signAllTransactions: <T extends Transaction | VersionedTransaction>(_txs: T[]): Promise<T[]> =>
    Promise.reject(new Error('Connect a wallet to send transactions.')),
};

export function useHandoffProgram(): Program<Idl> {
  const { connection } = useConnection();
  // Get the current active signer (either Phantom or the Burner)
  const { signer } = useDemoRole();

  return useMemo(() => {
    // Set up the Anchor Provider with the current signer
    const provider = new AnchorProvider(connection, signer ?? READ_ONLY_WALLET, {
      commitment: 'confirmed',
      preflightCommitment: 'confirmed',
    });
    
    // Return the compiled program
    return new Program(idlJson as Idl, provider);
  }, [connection, signer]);
}