// ==========================================================
// FILE: instructions/approve_handoff.rs
// PURPOSE: Allows the buyer to approve the delivery. 
// This releases the price to the seller.
// ==========================================================

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::{EscrowState, EscrowStatus, Tier, WARRANTY_WINDOW};
use crate::error::HandoffError;

#[derive(Accounts)]
pub struct ApproveHandoff<'info> {
    // The Buyer. Must sign to approve the deal.
    #[account(mut)]
    pub buyer: Signer<'info>,

    // The Escrow State.
    // `mut` because we update the status and the `price_released` flag.
    // `has_one = buyer` ensures ONLY the original buyer can call this.
    #[account(
        mut,
        has_one = buyer @ HandoffError::Unauthorized,
    )]
    pub escrow_state: Account<'info, EscrowState>,

    // The Escrow Vault (Source of funds).
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = escrow_state,
    )]
    pub escrow_vault: Account<'info, TokenAccount>,

    // The Seller's USDC Account (Destination for the price).
    // We strictly derive it using the stored seller pubkey to prevent 
    // a malicious buyer from sending the funds to their own account.
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = escrow_state.seller,
    )]
    pub seller_usdc: Account<'info, TokenAccount>,

    // The USDC Mint address.
    pub usdc_mint: Account<'info, token::Mint>,

    // Required programs.
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

impl<'info> ApproveHandoff<'info> {
    pub fn approve_handoff(&mut self) -> Result<()> {
        // 1. STATE CHECK
        // Ensure the seller has actually delivered the asset.
        require!(self.escrow_state.status == EscrowStatus::Delivered, HandoffError::InvalidStatus);

        // 2. CALCULATE PAYOUT
        // The price is released now. (Deposits, if Advanced, stay locked for the warranty).
        let payout_amount = self.escrow_state.amount;

        // 3. UPDATE STATE BEFORE TRANSFER
        // Rust enforces strict borrowing rules. We put this in a block `{ ... }` 
        // so that the mutable borrow of `escrow` is dropped before we do the CPI transfer below.
        {
            let escrow = &mut self.escrow_state;
            escrow.price_released = true;
            
            if escrow.tier == Tier::Advanced {
                escrow.status = EscrowStatus::Completed;
                let clock = Clock::get()?;
                escrow.warranty_deadline = clock.unix_timestamp + WARRANTY_WINDOW;
            } else {
                // Basic mode skips the warranty entirely and goes straight to Closed.
                escrow.status = EscrowStatus::Closed;
            }
        } 

        // 4. EXECUTE TRANSFER (CPI)
        // Now we safely borrow self.escrow_state immutably for the CPI.
        // We reconstruct the PDA seeds to allow the contract to sign the transfer.
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
            to: self.seller_usdc.to_account_info(),
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