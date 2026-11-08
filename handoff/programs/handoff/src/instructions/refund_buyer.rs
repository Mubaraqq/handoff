// ==========================================================
// FILE: instructions/refund_buyer.rs
// PURPOSE: Allows anyone to refund the buyer if the seller 
// accepts the deal but misses the delivery deadline.
// ==========================================================

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::{EscrowState, EscrowStatus};
use crate::error::HandoffError;

#[derive(Accounts)]
pub struct RefundBuyer<'info> {
    // Anyone can call this to clear a dead deal.
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

    // The Buyer's USDC Account (Destination for the refund).
    // We strictly derive it using the stored buyer pubkey.
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = escrow_state.buyer,
    )]
    pub buyer_usdc: Account<'info, TokenAccount>,

    pub usdc_mint: Account<'info, token::Mint>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

impl<'info> RefundBuyer<'info> {
    pub fn refund_buyer(&mut self) -> Result<()> {
        // 1. STATE CHECK
        // Can only refund if the seller accepted but hasn't delivered.
        require!(self.escrow_state.status == EscrowStatus::Accepted, HandoffError::InvalidStatus);

        // 2. TIMER CHECK
        // The seller had their chance. The delivery deadline must have passed.
        let clock = Clock::get()?;
        require!(clock.unix_timestamp >= self.escrow_state.delivery_deadline, HandoffError::TimerNotExpired);

        // 3. CALCULATE REFUND
        // The buyer gets EVERYTHING: Price + Buyer Deposit + Seller's slashed deposit.
        let refund_amount = self.escrow_state.amount
            .checked_add(self.escrow_state.buyer_deposit).ok_or(HandoffError::InvalidStatus)?
            .checked_add(self.escrow_state.seller_deposit).ok_or(HandoffError::InvalidStatus)?;

        // 4. UPDATE STATE
        self.escrow_state.status = EscrowStatus::Closed;

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
            to: self.buyer_usdc.to_account_info(),
            authority: self.escrow_state.to_account_info(),
        };
        
        let cpi_ctx = CpiContext::new_with_signer(
            self.token_program.key(), 
            cpi_accounts, 
            signer_seeds
        );
        
        token::transfer(cpi_ctx, refund_amount)?;

        Ok(())
    }
}