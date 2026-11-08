// ==========================================================
// FILE: instructions/cancel_deal.rs
// PURPOSE: Allows the buyer to cancel the deal and get a 
// full refund if the seller never accepts it.
// ==========================================================

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::{EscrowState, EscrowStatus};
use crate::error::HandoffError;

#[derive(Accounts)]
pub struct CancelDeal<'info> {
    // The Buyer. Must sign to authorize the refund.
    #[account(mut)]
    pub buyer: Signer<'info>,

    // The Escrow State.
    // `mut` because we are changing the status to Closed.
    // `has_one = buyer` ensures ONLY the original buyer can cancel this deal.
    // `close = buyer` is Anchor magic. When this instruction finishes, 
    // it deletes the escrow_state account and sends its rent (SOL) back to the buyer.
    #[account(
        mut,
        has_one = buyer @ HandoffError::Unauthorized,
        close = buyer
    )]
    pub escrow_state: Account<'info, EscrowState>,

    // The Escrow Vault holding the USDC.
    // `mut` because we are draining it.
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = escrow_state,
    )]
    pub escrow_vault: Account<'info, TokenAccount>,

    // The Buyer's USDC Account. (Where the refund goes).
    #[account(
        mut,
        constraint = buyer_usdc.mint == usdc_mint.key() @ HandoffError::InvalidStatus,
        constraint = buyer_usdc.owner == buyer.key() @ HandoffError::Unauthorized
    )]
    pub buyer_usdc: Account<'info, TokenAccount>,

    // The USDC Mint.
    pub usdc_mint: Account<'info, token::Mint>,

    // Required programs.
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

impl<'info> CancelDeal<'info> {
    pub fn cancel_deal(&mut self) -> Result<()> {
        let escrow = &self.escrow_state;

        // 1. STATE CHECK
        // You can only cancel a deal if the seller hasn't accepted it yet.
        require!(escrow.status == EscrowStatus::Initialized, HandoffError::InvalidStatus);

        // 2. CALCULATE REFUND
        // Since the seller never accepted, they never deposited the warranty.
        // The vault only holds the price + the buyer's deposit (if Advanced).
        let refund_amount = escrow.amount.checked_add(escrow.buyer_deposit).ok_or(HandoffError::InvalidStatus)?;

        // 3. EXECUTE TRANSFER (CPI)
        // We send the USDC from the Vault back to the Buyer.
        // Because the Vault is owned by the EscrowState PDA, we must use `new_with_signer`.
        let seeds = &[
            b"escrow",
            escrow.buyer.as_ref(),
            escrow.seller.as_ref(),
            &escrow.deal_id.to_le_bytes(),
            &[escrow.bump],
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

        // (The `close = buyer` constraint on the escrow_state account 
        // automatically handles changing the status to "closed" and deleting the account).

        Ok(())
    }
}