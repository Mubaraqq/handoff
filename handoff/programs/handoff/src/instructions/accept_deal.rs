// ==========================================================
// FILE: instructions/accept_deal.rs
// PURPOSE: Allows the seller to accept the trade. 
// If it's an Advanced tier, they lock their Warranty Deposit here.
// ==========================================================

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::{EscrowState, EscrowStatus, Tier, DELIVERY_WINDOW};
use crate::error::HandoffError;

#[derive(Accounts)]
pub struct AcceptDeal<'info> {
    // The Seller. Must sign to prove they are accepting the deal.
    #[account(mut)]
    pub seller: Signer<'info>,

    // The Escrow State.
    // `mut` because we are changing the status and setting the deadline.
    // `has_one = seller` checks that the person signing is the seller in the state.
    #[account(
        mut,
        has_one = seller @ HandoffError::Unauthorized,
    )]
    pub escrow_state: Account<'info, EscrowState>,

    // The Escrow Vault (USDC Account).
    // Receives the seller's deposit if Advanced.
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = escrow_state,
    )]
    pub escrow_vault: Account<'info, TokenAccount>,

    // The Seller's USDC Token Account.
    // The source of the deposit.
    #[account(
        mut,
        constraint = seller_usdc.mint == usdc_mint.key() @ HandoffError::InvalidStatus,
        constraint = seller_usdc.owner == seller.key() @ HandoffError::Unauthorized
    )]
    pub seller_usdc: Account<'info, TokenAccount>,

    pub usdc_mint: Account<'info, token::Mint>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

impl<'info> AcceptDeal<'info> {
    pub fn accept_deal(&mut self) -> Result<()> {
        let escrow = &mut self.escrow_state;

        // 1. STATE CHECK
        // Ensure the deal is actually waiting to be accepted.
        require!(escrow.status == EscrowStatus::Initialized, HandoffError::InvalidStatus);

        // 2. HANDLE THE DEPOSIT (If Advanced)
        // If it's the Advanced tier, the seller must lock their deposit.
        if escrow.tier == Tier::Advanced {
            // Transfer USDC from Seller to Escrow Vault
            let cpi_accounts = Transfer {
                from: self.seller_usdc.to_account_info(),
                to: self.escrow_vault.to_account_info(),
                authority: self.seller.to_account_info(),
            };
            let cpi_ctx = CpiContext::new(self.token_program.key(), cpi_accounts);
            
            // We use the deposit amount saved during the `initialize` step.
            token::transfer(cpi_ctx, escrow.seller_deposit)?;
        }

        // 3. UPDATE STATE
        escrow.status = EscrowStatus::Accepted;
        
        // 4. SET TIMER
        // Set the delivery deadline (5 minutes from now for the demo).
        let clock = Clock::get()?;
        escrow.delivery_deadline = clock.unix_timestamp + DELIVERY_WINDOW; 

        Ok(())
    }
}