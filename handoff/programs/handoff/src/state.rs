// ==========================================================
// FILE: state.rs
// PURPOSE: Defines the on-chain data structures and the time constants.
// This is the exact blueprint from "Handoff: Final Design".
// ==========================================================

use anchor_lang::prelude::*;

// ----------------------------------------------------------
// TIMER CONSTANTS
// ----------------------------------------------------------
// For the hackathon, we use minutes/seconds so we can demo the timers live.
// In production, these would be 7 days, 72 hours, 30 days, and 14 days.

pub const DELIVERY_WINDOW: i64 = 300;    // 5 minutes
pub const INSPECTION_WINDOW: i64 = 120;  // 2 minutes
pub const WARRANTY_WINDOW: i64 = 300;    // 5 minutes
pub const DISPUTE_TIMEOUT: i64 = 600;    // 10 minutes

// ----------------------------------------------------------
// ENUMS
// ----------------------------------------------------------

// The two modes of Handoff. 
// Basic: Just the price. No deposits, no warranty.
// Advanced: Includes deposits and a warranty window.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum Tier {
    Basic,
    Advanced,
}

// The State Machine. 
// The contract strictly enforces these transitions so a user cannot skip steps.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum EscrowStatus {
    Initialized, // 0: Buyer locked funds, waiting for seller
    Accepted,    // 1: Seller accepted, waiting to deliver
    Delivered,   // 2: Seller delivered the hash, waiting for buyer approval or timeout
    Completed,   // 3: Buyer approved (Advanced only - keeps warranty open)
    Disputed,    // 4: Dispute opened, waiting for Arbitrator
    Closed,      // 5: Deal is completely finished
}

// ----------------------------------------------------------
// THE STATE ACCOUNT
// ----------------------------------------------------------

#[account]
#[derive(InitSpace)]
pub struct EscrowState {
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub arbitrator: Pubkey,
    
    // The specific token mint (e.g., USDC). 
    // We store this to prevent a malicious user from passing a fake token 
    // account during the payout step. Every token account is checked against this.
    pub mint: Pubkey,
    
    // A unique ID for the deal. This allows the same buyer and seller 
    // to have multiple deals at the same time without PDA collision.
    pub deal_id: u64,
    
    pub tier: Tier,
    pub amount: u64,          // The price of the item
    pub buyer_deposit: u64,   // 0 if Basic
    pub seller_deposit: u64,  // 0 if Basic
    
    // Tracks if the base price has been paid out. 
    // This is crucial for the Arbitrator to know which payout table to use 
    // if a dispute happens later.
    pub price_released: bool,
    
    // Cryptographic hashes (32 bytes). 
    // Checklist hash proves the agreed terms. File hash proves what was delivered.
    pub checklist_hash: [u8; 32],
    pub file_hash: [u8; 32],
    
    pub status: EscrowStatus,
    
    // Unix timestamps to enforce the deadlines.
    pub delivery_deadline: i64,
    pub inspection_deadline: i64,
    pub warranty_deadline: i64,
    pub disputed_at: i64, // Used for the 14-day dispute timeout
    
    pub bump: u8,
}