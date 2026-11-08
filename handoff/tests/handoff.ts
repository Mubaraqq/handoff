// ==========================================================
// FILE: tests/handoff.ts
// PURPOSE: Tests the Basic Mode Happy Path end-to-end.
// This simulates a full escrow lifecycle on a local validator.
// ==========================================================

// Import the Anchor framework
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";

// Import the TypeScript types generated from our Rust code
import { Handoff } from "../target/types/handoff";

// Import SPL Token helpers to create and manage our fake USDC
import { 
  createMint, 
  getOrCreateAssociatedTokenAccount, 
  mintTo, 
  getAccount 
} from "@solana/spl-token";

// Import basic Solana web3 tools
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { assert } from "chai";

describe("handoff", () => {
  // 1. SETUP PROVIDER & PROGRAM
  // This connects to the local validator that Anchor spins up automatically
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // Load our compiled smart contract
  const program = anchor.workspace.Handoff as Program<Handoff>;
  
  // 2. DEFINE TEST WALLETS
  // The buyer is the default wallet Anchor uses to pay for tests.
  const buyer = provider.wallet as anchor.Wallet;
  // We generate random keypairs for the seller and arbitrator to simulate other users.
  const seller = Keypair.generate();
  const arbitrator = Keypair.generate();

  // Variables to hold our token addresses
  let usdcMint: PublicKey;
  let buyerUsdcAccount: PublicKey;
  let sellerUsdcAccount: PublicKey;

  // 3. DEAL PARAMETERS
  const dealId = new anchor.BN(1);
  const amount = new anchor.BN(100 * 10**6); // 100 USDC (USDC has 6 decimals)
  const buyerDeposit = new anchor.BN(0);     // 0 for Basic Tier
  const sellerDeposit = new anchor.BN(0);    // 0 for Basic Tier
  const checklistHash = Array(32).fill(1);   // Fake 32-byte hash
  const fileHash = Array(32).fill(2);        // Fake 32-byte hash

  // 4. BEFORE HOOK
  // This runs once before all the tests to set up the environment.
  before(async () => {
    // Create a brand new SPL Token to act as our fake USDC
    usdcMint = await createMint(
      provider.connection,
      buyer.payer,     // Who pays for the mint account
      buyer.publicKey, // Mint authority
      null,            // Freeze authority (none)
      6                // Decimals
    );

    // Create a USDC token account for the Buyer
    const buyerAta = await getOrCreateAssociatedTokenAccount(
      provider.connection, buyer.payer, usdcMint, buyer.publicKey
    );
    buyerUsdcAccount = buyerAta.address;

    // Create a USDC token account for the Seller
    const sellerAta = await getOrCreateAssociatedTokenAccount(
      provider.connection, buyer.payer, usdcMint, seller.publicKey
    );
    sellerUsdcAccount = sellerAta.address;

    // Give the Buyer 1,000 USDC to play with
    await mintTo(
      provider.connection,
      buyer.payer,
      usdcMint,
      buyerUsdcAccount,
      buyer.payer,
      1000 * 10**6
    );
  });

  // Variables to store the PDA addresses so we can use them in later tests
  let escrowPda: PublicKey;
  let escrowVault: PublicKey;

  // ==========================================================
  // TEST 1: INITIALIZE
  // ==========================================================
  it("Initializes the Basic Deal", async () => {
    // Calculate the Escrow State PDA address using the same seeds as the Rust code
    [escrowPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("escrow"), 
        buyer.publicKey.toBuffer(), 
        seller.publicKey.toBuffer(), 
        dealId.toArrayLike(Buffer, "le", 8) // Convert u64 to bytes
      ],
      program.programId
    );

        // Calculate the Escrow Vault address (the Rust program will create it)
    // We use getAssociatedTokenAddressSync instead of getOrCreate so we don't create it twice.
    const { getAssociatedTokenAddressSync } = require("@solana/spl-token");
    escrowVault = getAssociatedTokenAddressSync(usdcMint, escrowPda, true);

    // Call the initialize instruction
    await program.methods
      .initialize(
        dealId,
        amount,
        { basic: {} }, // We pass the Basic enum variant
        buyerDeposit,
        sellerDeposit,
        checklistHash
      )
      .accounts({
        buyer: buyer.publicKey,
        seller: seller.publicKey,
        arbitrator: arbitrator.publicKey,
        escrowState: escrowPda,
        buyerUsdc: buyerUsdcAccount,
        escrowVault: escrowVault,
        usdcMint: usdcMint,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // ASSERT: Check that the Vault actually received the 100 USDC
    const vaultAccount = await getAccount(provider.connection, escrowVault);
    assert.equal(vaultAccount.amount.toString(), amount.toString(), "Vault should hold the price");
  });

  // ==========================================================
  // TEST 2: ACCEPT DEAL
  // ==========================================================
  it("Seller Accepts the Deal", async () => {
    await program.methods
      .acceptDeal()
      .accounts({
        seller: seller.publicKey,
        escrowState: escrowPda,
        escrowVault: escrowVault,
        sellerUsdc: sellerUsdcAccount,
        usdcMint: usdcMint,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      // We must sign with the seller's keypair because they are the ones accepting
      .signers([seller])
      .rpc();
  });

  // ==========================================================
  // TEST 3: DELIVER ASSET
  // ==========================================================
  it("Seller Delivers the Asset", async () => {
    await program.methods
      .deliverAsset(fileHash)
      .accounts({
        seller: seller.publicKey,
        escrowState: escrowPda,
      })
      .signers([seller])
      .rpc();
  });

  // ==========================================================
  // TEST 4: APPROVE HANDOFF
  // ==========================================================
  it("Buyer Approves the Handoff", async () => {
    // Get the seller's balance BEFORE the approval
    const sellerBalanceBefore = (await getAccount(provider.connection, sellerUsdcAccount)).amount;

    await program.methods
      .approveHandoff()
      .accounts({
        buyer: buyer.publicKey,
        escrowState: escrowPda,
        escrowVault: escrowVault,
        sellerUsdc: sellerUsdcAccount,
        usdcMint: usdcMint,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Get the seller's balance AFTER the approval
    const sellerBalanceAfter = (await getAccount(provider.connection, sellerUsdcAccount)).amount;
    
    // Check the vault is empty
    const vaultAccount = await getAccount(provider.connection, escrowVault);

    // ASSERT: The difference should be exactly 100 USDC
    assert.equal(
      (sellerBalanceAfter - sellerBalanceBefore).toString(), 
      amount.toString(), 
      "Seller should receive the price"
    );
    // ASSERT: The vault should be completely drained
    assert.equal(vaultAccount.amount.toString(), "0", "Vault should be empty");
  });
});