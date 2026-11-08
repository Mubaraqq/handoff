// ==========================================================
// FILE: instructions/deliver_asset.rs
// PURPOSE: Allows the seller to submit the file hash and 
// start the inspection timer.
// ==========================================================

use anchor_lang::prelude::*;
use crate::state::{EscrowState, EscrowStatus, INSPECTION_WINDOW};
use crate::error::HandoffError;

#[derive(Accounts)]
pub struct DeliverAsset<'info> {
    // The Seller. Must sign to prove they are delivering.
    #[account(mut)]
    pub seller: Signer<'info>,

    // The Escrow State.
    // `mut` because we are changing the status, saving the hash, and setting the timer.
    // `has_one = seller` ensures only the seller can call this.
    #[account(
        mut,
        has_one = seller @ HandoffError::Unauthorized,
    )]
    pub escrow_state: Account<'info, EscrowState>,
}

impl<'info> DeliverAsset<'info> {
    pub fn deliver_asset(&mut self, file_hash: [u8; 32]) -> Result<()> {
        let escrow = &mut self.escrow_state;

        // 1. STATE CHECK
        // Can only deliver if the seller has already accepted the deal.
        require!(escrow.status == EscrowStatus::Accepted, HandoffError::InvalidStatus);

        // 2. TIMER CHECK
        // The seller must deliver BEFORE the delivery deadline expires.
        // If they are late, they have to rely on the buyer to manually refund them 
        // (via refund_buyer), because the deal is dead.
        let clock = Clock::get()?;
        require!(clock.unix_timestamp < escrow.delivery_deadline, HandoffError::TimerExpired);

        // 3. HASH CHECK
        // Ensure the hash isn't just 32 bytes of zeros (which means they delivered nothing).
        require!(file_hash != [0; 32], HandoffError::InvalidStatus);

        // 4. UPDATE STATE
        escrow.file_hash = file_hash;
        escrow.status = EscrowStatus::Delivered;
        
        // 5. START THE INSPECTION TIMER
        // The buyer now has 2 minutes (demo time) to inspect it.
        escrow.inspection_deadline = clock.unix_timestamp + INSPECTION_WINDOW;

        Ok(())
    }
}