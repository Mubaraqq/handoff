// --- ADVANCED MODE INSTRUCTION ---

// ==========================================================
// FILE: instructions/resolve_dispute.rs
// PURPOSE: The Arbitrator rules on a dispute and releases 
// the funds to the winner.
// ==========================================================

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::{EscrowState, EscrowStatus};
use crate::error::HandoffError;

#[derive(Accounts)]
pub struct ResolveDispute<'info> {
    // The Arbitrator. Must sign to prove they are making the ruling.
    #[account(mut)]
    pub arbitrator: Signer<'info>,

    // The Escrow State.
    // `mut` because we change status to Closed.
    // `has_one = arbitrator` ensures ONLY the assigned admin can resolve.
    #[account(
        mut,
        has_one = arbitrator @ HandoffError::Unauthorized,
    )]
    pub escrow_state: Account<'info, EscrowState>,

    // The Escrow Vault (Source of funds).
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = escrow_state,
    )]
    pub escrow_vault: Account<'info, TokenAccount>,

    // The Buyer's USDC Account (Potential destination).
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = escrow_state.buyer,
    )]
    pub buyer_usdc: Account<'info, TokenAccount>,

    // The Seller's USDC Account (Potential destination).
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = escrow_state.seller,
    )]
    pub seller_usdc: Account<'info, TokenAccount>,

    pub usdc_mint: Account<'info, token::Mint>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

impl<'info> ResolveDispute<'info> {
    pub fn resolve_dispute(&mut self, buyer_wins: bool) -> Result<()> {
        // 1. STATE CHECK
        require!(self.escrow_state.status == EscrowStatus::Disputed, HandoffError::InvalidStatus);

        // 2. CALCULATE PAYOUT
        // The total left in the vault is always: deposits + (price if not released)
        let mut payout_amount = self.escrow_state.buyer_deposit
            .checked_add(self.escrow_state.seller_deposit).ok_or(HandoffError::InvalidStatus)?;

        if !self.escrow_state.price_released {
            payout_amount = payout_amount
                .checked_add(self.escrow_state.amount).ok_or(HandoffError::InvalidStatus)?;
        }

        // 3. DETERMINE DESTINATION
        // If buyer_wins is true, send to buyer. Otherwise, send to seller.
        let destination_account = if buyer_wins {
            self.buyer_usdc.to_account_info()
        } else {
            self.seller_usdc.to_account_info()
        };

        // 4. UPDATE STATE
        self.escrow_state.status = EscrowStatus::Closed;
        self.escrow_state.price_released = true; // Mark as released so it can't be claimed again.

        // 5. EXECUTE TRANSFER (CPI)
        let seeds = &[
            b"escrow",
            self.escrow_state.buyer.as_ref(),
            self.escrow_state.seller.as_ref(),
            &self.escrow_state.deal_id.to_le_bytes(),
            &[self.escrow_state.bump],
        ];
        let signer_seeds = &[&seeds[..]];

        let cpi_accounts = Transfer {
            from: self.escrow_vault.to_account_info(),
            to: destination_account,
            authority: self.escrow_state.to_account_info(),
        };
        
        let cpi_ctx = CpiContext::new_with_signer(
            self.token_program.key(), 
            cpi_accounts, 
            signer_seeds
        );
        
        token::transfer(cpi_ctx, payout_amount)?;

        Ok(())
    }
}