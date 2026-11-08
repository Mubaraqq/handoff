// ==========================================================
// FILE: instructions/auto_release.rs
// PURPOSE: Allows anyone to release the funds to the seller 
// if the buyer ghosts the platform after the inspection window expires.
// ==========================================================

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::{EscrowState, EscrowStatus, Tier, WARRANTY_WINDOW};
use crate::error::HandoffError;

#[derive(Accounts)]
pub struct AutoRelease<'info> {
    // Notice there is NO buyer or seller signer here. 
    // The caller is "Anyone" (could be a bot, a keeper, or a random user).
    
    // We need the caller to pay the transaction fee, but we don't care who they are.
    #[account(mut)]
    pub caller: Signer<'info>,

    // The Escrow State.
    // `mut` because we update the status and the `price_released` flag.
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

    // The Seller's USDC Account (Destination for the price).
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

impl<'info> AutoRelease<'info> {
    pub fn auto_release(&mut self) -> Result<()> {
        // 1. STATE CHECK
        require!(self.escrow_state.status == EscrowStatus::Delivered, HandoffError::InvalidStatus);

        // 2. TIMER CHECK
        // The ONLY way this differs from approve_handoff. 
        // The inspection window MUST be over.
        let clock = Clock::get()?;
        require!(clock.unix_timestamp >= self.escrow_state.inspection_deadline, HandoffError::TimerNotExpired);

        // 3. CALCULATE PAYOUT
        let payout_amount = self.escrow_state.amount;

        // 4. UPDATE STATE
        {
            let escrow = &mut self.escrow_state;
            escrow.price_released = true;
            
            if escrow.tier == Tier::Advanced {
                escrow.status = EscrowStatus::Completed;
                escrow.warranty_deadline = clock.unix_timestamp + WARRANTY_WINDOW;
            } else {
                escrow.status = EscrowStatus::Closed;
            }
        }

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