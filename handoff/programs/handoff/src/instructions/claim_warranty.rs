// --- ADVANCED MODE INSTRUCTION ---

// ==========================================================
// FILE: instructions/claim_warranty.rs
// PURPOSE: Returns the buyer and seller deposits after the 
// warranty window has safely expired.
// ==========================================================

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::{EscrowState, EscrowStatus};
use crate::error::HandoffError;

#[derive(Accounts)]
pub struct ClaimWarranty<'info> {
    // Anyone can call this to clear the funds.
    #[account(mut)]
    pub caller: Signer<'info>,

    // The Escrow State.
    // `mut` because we change status to Closed.
    #[account(
        mut,
    )]
    pub escrow_state: Account<'info, EscrowState>,

    // The Escrow Vault (Source of funds).
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = escrow_state,
    )]
    pub escrow_vault: Account<'info, TokenAccount>,

    // The Buyer's USDC Account (Destination for their deposit).
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = escrow_state.buyer,
    )]
    pub buyer_usdc: Account<'info, TokenAccount>,

    // The Seller's USDC Account (Destination for their deposit).
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

impl<'info> ClaimWarranty<'info> {
    pub fn claim_warranty(&mut self) -> Result<()> {
        // 1. STATE CHECK
        // Warranty only exists in Advanced mode after approval (Completed status).
        require!(self.escrow_state.status == EscrowStatus::Completed, HandoffError::InvalidStatus);

        // 2. TIMER CHECK
        // The warranty window must be over.
        let clock = Clock::get()?;
        require!(clock.unix_timestamp >= self.escrow_state.warranty_deadline, HandoffError::TimerNotExpired);

        // 3. UPDATE STATE
        self.escrow_state.status = EscrowStatus::Closed;

        // 4. RECONSTRUCT PDA SEEDS FOR TRANSFER
        let seeds = &[
            b"escrow",
            self.escrow_state.buyer.as_ref(),
            self.escrow_state.seller.as_ref(),
            &self.escrow_state.deal_id.to_le_bytes(),
            &[self.escrow_state.bump],
        ];
        let signer_seeds = &[&seeds[..]];

        let cpi_program = self.token_program.key();
        let authority = self.escrow_state.to_account_info();

        // 5. EXECUTE TRANSFER (Buyer Deposit)
        if self.escrow_state.buyer_deposit > 0 {
            let cpi_accounts = Transfer {
                from: self.escrow_vault.to_account_info(),
                to: self.buyer_usdc.to_account_info(),
                authority: authority.clone(),
            };
            let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
            token::transfer(cpi_ctx, self.escrow_state.buyer_deposit)?;
        }

        // 6. EXECUTE TRANSFER (Seller Deposit)
        if self.escrow_state.seller_deposit > 0 {
            let cpi_accounts = Transfer {
                from: self.escrow_vault.to_account_info(),
                to: self.seller_usdc.to_account_info(),
                authority: authority.clone(),
            };
            let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
            token::transfer(cpi_ctx, self.escrow_state.seller_deposit)?;
        }

        Ok(())
    }
}