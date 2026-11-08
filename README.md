# Handoff: Trustless Escrow for the Digital Economy

## The Problem
The digital creator economy (developers, designers, API providers) is built on "trust me bro." When you buy an API key, a piece of code, or a digital account from someone online, one person has to go first. 
- If the buyer pays first, the seller can ghost them.
- If the seller delivers first, the buyer can take the files and run.

## The Solution
**Handoff** is a trustless escrow protocol on Solana. The buyer locks USDC in a smart contract. The seller delivers the digital asset. The buyer gets a window to verify it, and the funds release. If there is a dispute, a neutral arbitrator steps in.

## Why this wins the hackathon
This isn't a "chain bolted onto a Web2 app." The entire logic lives on-chain. 
- **Speed & Cost:** Transactions settle in milliseconds for fractions of a cent, making $50 trades viable.
- **On-chain Escrow State Machine:** The smart contract enforces the entire lifecycle: `Initialized -> Accepted -> Delivered -> Completed/Disputed`.
- **Game Theory:** In Advanced mode, we introduce seller warranty deposits to protect against "rug pulls" and buyer dispute deposits to prevent fake complaints.

## How we built it
- **Smart Contract:** Anchor (Rust). Handles PDA derivation, SPL token transfers, time-based deadlines, and dispute resolution.
- **Frontend:** React + Vite + TypeScript + Tailwind CSS.
- **Wallet Adapter:** Phantom Wallet integration.

## The "Demo Mode" Feature
To allow judges to test both sides of the escrow without switching Phantom wallets, we built a **Burner Wallet system**. Clicking "Seller" in the UI generates a local Keypair, airdrops SOL, and mints test USDC to it. The app then uses this burner wallet to sign the Seller's actions natively.

## How to Test the Flow
1. Connect your Phantom Wallet (Devnet).
2. Get test USDC (contact us or use the faucet).
3. **Create Deal:** Paste the demo Seller address, type the terms, and lock 100 USDC.
4. **Accept Deal:** Toggle the role switch to "Seller" and click Accept.
5. **Deliver Asset:** Submit a fake file hash.
6. **Approve:** Toggle back to "Buyer" and click Approve. The funds instantly transfer to the seller.

## Repository Structure
- `/handoff` (Smart Contract) - The Anchor program.
- `/handoff-ui` (Frontend) - The React application.

## Smart Contract Address
`A3ei9dw6ScZ8Wmcw54h7RrtbyexRetGrZv8vxjRtoY9G`

## Built By
Mubarak Yakubu 
mubaraqabba@gmail.com
