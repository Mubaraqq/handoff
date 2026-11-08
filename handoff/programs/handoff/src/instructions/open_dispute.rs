// --- ADVANCED MODE INSTRUCTION ---

// ==========================================================
// FILE: instructions/open_dispute.rs
// PURPOSE: Allows the buyer to freeze the funds if the 
// delivered asset is broken or fake.
// ==========================================================

use anchor_lang::prelude::*;
use crate::state::{EscrowState, EscrowStatus, Tier};
use crate::error::HandoffError;

#[derive(Accounts)]
pub struct OpenDispute<'info> {
    // Only the Buyer can open a dispute.
    #[account(mut)]
    pub buyer: Signer<'info>,

    // The Escrow State.
    // `mut` because we change the status to Disputed and set `disputed_at`.
    // `has_one = buyer` ensures only the buyer can call this.
    #[account(
        mut,
        has_one = buyer @ HandoffError::Unauthorized,
    )]
    pub escrow_state: Account<'info, EscrowState>,
}

impl<'info> OpenDispute<'info> {
    pub fn open_dispute(&mut self) -> Result<()> {
        let escrow = &mut self.escrow_state;
        let clock = Clock::get()?;

        // 1. STATE & TIMER CHECKS
        // There are two windows where a dispute is valid:
        // A) Right after delivery, before the inspection window closes.
        // B) If Advanced, during the 30-day warranty window.
        
        if escrow.status == EscrowStatus::Delivered {
            // Must be before the inspection deadline.
            require!(clock.unix_timestamp < escrow.inspection_deadline, HandoffError::TimerExpired);
        } else if escrow.status == EscrowStatus::Completed && escrow.tier == Tier::Advanced {
            // Advanced tier allows a warranty dispute.
            require!(clock.unix_timestamp < escrow.warranty_deadline, HandoffError::TimerExpired);
        } else {
            // If it's Basic tier and already Completed, or if it's in any other state, 
            // you cannot open a dispute.
            return Err(HandoffError::InvalidStatus.into());
        }

        // 2. UPDATE STATE
        // We freeze the vault by changing the status. 
        // The `resolve_dispute` instruction will handle the payout.
        escrow.status = EscrowStatus::Disputed;
        escrow.disputed_at = clock.unix_timestamp;

        Ok(())
    }
}