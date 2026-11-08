// --- ADVANCED MODE INSTRUCTION ---

// ==========================================================
// FILE: instructions/expire_dispute.rs
// PURPOSE: The ultimate fail-safe. If the Arbitrator never rules,
// anyone can call this after the timeout to return funds to both parties.
// ==========================================================

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::{EscrowState, EscrowStatus, DISPUTE_TIMEOUT};
use crate::error::HandoffError;

#[derive(Accounts)]
pub struct ExpireDispute<'info> {
    // Anyone can call this to un-stick the funds.
    #[account(mut)]
    pub caller: Signer<'info>,

    // The Escrow State.
    #[account(
        mut,
    )]
    pub escrow_state: Account<'info, EscrowState>,

    // The Escrow Vault.
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = escrow_state,
    )]
    pub escrow_vault: Account<'info, TokenAccount>,

    // The Buyer's USDC Account.
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = escrow_state.buyer,
    )]
    pub buyer_usdc: Account<'info, TokenAccount>,

    // The Seller's USDC Account.
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

impl<'info> ExpireDispute<'info> {
    pub fn expire_dispute(&mut self) -> Result<()> {
        // 1. STATE CHECK
        require!(self.escrow_state.status == EscrowStatus::Disputed, HandoffError::InvalidStatus);

        // 2. TIMER CHECK
        // Must be 10 minutes (demo) after the dispute was opened.
        let clock = Clock::get()?;
        let expire_time = self.escrow_state.disputed_at.checked_add(DISPUTE_TIMEOUT).ok_or(HandoffError::InvalidStatus)?;
        require!(clock.unix_timestamp >= expire_time, HandoffError::TimerNotExpired);

        // 3. UPDATE STATE
        self.escrow_state.status = EscrowStatus::Closed;

        // 4. RECONSTRUCT PDA SEEDS
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

        // 5. PAYOUT TO BUYER
        // If price wasn't released, buyer gets amount + buyer_deposit. Otherwise, just buyer_deposit.
        let mut buyer_amount = self.escrow_state.buyer_deposit;
        if !self.escrow_state.price_released {
            buyer_amount = buyer_amount.checked_add(self.escrow_state.amount).ok_or(HandoffError::InvalidStatus)?;
        }

        if buyer_amount > 0 {
            let cpi_accounts = Transfer {
                from: self.escrow_vault.to_account_info(),
                to: self.buyer_usdc.to_account_info(),
                authority: authority.clone(),
            };
            let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
            token::transfer(cpi_ctx, buyer_amount)?;
        }

        // 6. PAYOUT TO SELLER (Always gets their deposit back)
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