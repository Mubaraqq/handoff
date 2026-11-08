// ==========================================================
// FILE: pages/CreateDeal.tsx
// PURPOSE: The form to create a new deal. It calculates the PDAs,
// hashes the terms, and locks the funds in the smart contract.
// ==========================================================

import { useState } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { 
  getAssociatedTokenAddressSync, 
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID
} from '@solana/spl-token';
import { useHandoffProgram } from '../hooks/useHandoffProgram';
import { useDemoRole } from '../lib/demo/DemoRoleContext';
import { getUsdcMint } from '../lib/constants';
import { Button, Input, Card } from '../components/ui';

// Read the neutral arbitrator address from the .env file.
// We use a 3rd party to avoid the "Buyer cannot be Arbitrator" error.
const ARBITRATOR_ADDRESS = new PublicKey(import.meta.env.VITE_ARBITRATOR_ADDRESS);

interface CreateDealProps {
  onBack: () => void;
  onSuccess: (address: string) => void;
}

export function CreateDeal({ onBack, onSuccess }: CreateDealProps) {
  // Get the connected wallet and the connection to the Solana network
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  
  // Get the active signer (Buyer or Burner) from our demo context
  const { signer } = useDemoRole();
  
  // Get the compiled Anchor program
  const program = useHandoffProgram();

  // --- FORM STATE ---
  const [seller, setSeller] = useState('');
  const [terms, setTerms] = useState(''); // State for the deal terms
  const [amount, setAmount] = useState('100');
  const [tier, setTier] = useState(0); // 0 = Basic, 1 = Advanced
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Get the USDC mint address from constants
  const usdcMint = getUsdcMint();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Make sure we have a wallet, a signer, a mint, and a signing function
    if (!publicKey || !signer || !usdcMint || !signTransaction) return;

    try {
      setIsLoading(true);
      setError('');

      // --- 1. VALIDATE INPUTS ---
      let sellerPubkey;
      try {
        sellerPubkey = new PublicKey(seller);
      } catch {
        throw new Error("Invalid seller wallet address.");
      }

      // Ensure the Buyer isn't trying to trade with themselves
      if (sellerPubkey.equals(publicKey)) {
        throw new Error("You cannot be both the buyer and the seller.");
      }

      // Ensure the Arbitrator is a neutral 3rd party
      if (ARBITRATOR_ADDRESS.equals(publicKey) || ARBITRATOR_ADDRESS.equals(sellerPubkey)) {
        throw new Error("The arbitrator cannot be the buyer or the seller.");
      }

      // --- 2. CALCULATE PDAs AND ADDRESSES ---
      // Generate a random ID for this specific deal
      const dealId = new BN(Math.floor(Math.random() * 1000000));
      
      // Convert the USDC amount to base units (6 decimals)
      const amountLamports = new BN(Number(amount) * 10 ** 6); 

      // Hash the terms into a 32-byte array using the browser's native crypto API.
      // This creates a unique fingerprint of the terms that we store on-chain.
      const termsBuffer = new TextEncoder().encode(terms);
      const hashBuffer = await crypto.subtle.digest('SHA-256', termsBuffer);
      const checklistHash = Array.from(new Uint8Array(hashBuffer));

      // Derive the Escrow PDA address
      const [escrowPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("escrow"),
          publicKey.toBuffer(),
          sellerPubkey.toBuffer(),
          dealId.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );

      // Derive the Buyer's token account and the Escrow Vault token account
      const buyerAta = getAssociatedTokenAddressSync(usdcMint, publicKey);
      const escrowVault = getAssociatedTokenAddressSync(usdcMint, escrowPda, true);

      // --- 3. BUILD THE TRANSACTION ---
      console.log("Building transaction...");
      const tx = await program.methods
        .initialize(
          dealId,
          amountLamports,
          tier === 0 ? { basic: {} } : { advanced: {} },
          new BN(0), // buyerDeposit (0 for Basic)
          new BN(0), // sellerDeposit (0 for Basic)
          checklistHash // <-- Pass the real hash of the terms
        )
        .accounts({
          buyer: publicKey,
          seller: sellerPubkey,
          arbitrator: ARBITRATOR_ADDRESS,
          escrowState: escrowPda,
          buyerUsdc: buyerAta,
          escrowVault: escrowVault,
          usdcMint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .transaction(); // Build the transaction but don't send it yet

      // --- 4. SET BLOCKHASH AND FEE PAYER ---
      tx.feePayer = publicKey;
      const latestBlockhash = await connection.getLatestBlockhash();
      tx.recentBlockhash = latestBlockhash.blockhash;

      // --- 5. SIGN AND SEND ---
      console.log("Requesting signature...");
      const signedTx = await signTransaction(tx);
      
      console.log("Sending transaction...");
      const signature = await connection.sendRawTransaction(signedTx.serialize());
      
      // Wait for the network to confirm the transaction
      await connection.confirmTransaction({
        signature,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
      });

      console.log("Transaction successful:", signature);

      // --- 6. SAVE DATA LOCALLY ---
      // The blockchain only stores the HASH of the terms. We save the actual text 
      // in localStorage so the UI can display it later.
      const stored = localStorage.getItem(`handoff_deals_${publicKey.toBase58()}`);
      const currentDeals = stored ? JSON.parse(stored) : [];
      
      localStorage.setItem(`handoff_terms_${escrowPda.toBase58()}`, terms);
      localStorage.setItem(
        `handoff_deals_${publicKey.toBase58()}`, 
        JSON.stringify([escrowPda.toBase58(), ...currentDeals])
      );

      // --- 7. REDIRECT ---
      // Wait 2 seconds for the Solana RPC node to catch up and index the new account.
      // If we don't wait, the Deal Room will say "Error loading deal" because the node hasn't seen it yet.
      await new Promise(resolve => setTimeout(resolve, 5000));
      onSuccess(escrowPda.toBase58());

    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to create deal.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <button onClick={onBack} className="text-gray-400 hover:text-white mb-6 font-medium flex items-center gap-2">
        &larr; Back to Dashboard
      </button>

      <Card className="p-8">
        <h2 className="text-2xl font-semibold mb-2">Initialize Escrow</h2>
        <p className="text-gray-400 mb-8">
          Lock your funds in a smart contract. They will only be released when you approve the delivery.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          
          <Input
            label="Seller Wallet Address"
            placeholder="e.g. 8Ctdyqtz..."
            value={seller}
            onChange={(e) => setSeller(e.target.value)}
            required
          />

          {/* The text area for the deal terms */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-gray-400">What is being traded? (Terms)</label>
            <textarea 
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              placeholder="e.g. I will deliver the source code for the React dashboard..."
              className="w-full bg-black border border-gray-800 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-[#14F195] min-h-[100px]"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-6">
            <Input
              label="Price (USDC)"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
            
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-gray-400">Tier</label>
              <select 
                value={tier}
                onChange={(e) => setTier(Number(e.target.value))}
                className="w-full bg-black border border-gray-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#14F195]"
              >
                <option value={0}>Basic (No deposits)</option>
                <option value={1}>Advanced (Warranty & Disputes)</option>
              </select>
            </div>
          </div>

          {error && (
            <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          <Button type="submit" disabled={isLoading} className="mt-4">
            {isLoading ? 'Confirming in Wallet...' : `Lock ${amount} USDC in Escrow`}
          </Button>
        </form>
      </Card>
    </div>
  );
}