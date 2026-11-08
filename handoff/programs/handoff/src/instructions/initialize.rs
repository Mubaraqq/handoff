// ==========================================================
// FILE: instructions/initialize.rs
// PURPOSE: Creates the escrow, locks the buyer's funds, and 
// saves the exact terms of the deal. 
// ==========================================================

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use anchor_spl::associated_token::AssociatedToken;
use crate::state::{EscrowState, EscrowStatus, Tier};
use crate::error::HandoffError;

// We only pass `deal_id` to the macro because it's the only argument 
// used to calculate the PDA seeds below.
#[derive(Accounts)]
#[instruction(deal_id: u64)]
pub struct Initialize<'info> {
    // The buyer initiating the deal. Must sign the transaction.
    #[account(mut)]
    pub buyer: Signer<'info>,

    /// CHECK: We just need the seller's public key to store it and use it in the PDA seeds.
    /// We don't need to read any data from this account.
    #[account(constraint = seller.key() != buyer.key() @ HandoffError::BuyerIsSeller)]
    pub seller: UncheckedAccount<'info>,

    /// CHECK: The arbitrator is an admin. They don't need to sign at creation, 
    /// but they must be a neutral 3rd party.
    #[account(
        constraint = arbitrator.key() != buyer.key() @ HandoffError::ArbitratorIsBuyer,
        constraint = arbitrator.key() != seller.key() @ HandoffError::ArbitratorIsSeller
    )]
    pub arbitrator: UncheckedAccount<'info>,

    // The Escrow State Account.
    #[account(
        init,
        payer = buyer,
        space = 8 + EscrowState::INIT_SPACE,
        seeds = [b"escrow", buyer.key().as_ref(), seller.key().as_ref(), &deal_id.to_le_bytes()],
        bump
    )]
    pub escrow_state: Account<'info, EscrowState>,

    // The buyer's USDC token account. 
    // We use native Anchor SPL checks to ensure it's correct.
    #[account(
        mut, 
        token::mint = usdc_mint, 
        token::authority = buyer
    )]
    pub buyer_usdc: Account<'info, TokenAccount>,

    // The Escrow Vault.
    #[account(
        init,
        payer = buyer,
        associated_token::mint = usdc_mint,
        associated_token::authority = escrow_state,
    )]
    pub escrow_vault: Account<'info, TokenAccount>,

    // The USDC mint address.
    pub usdc_mint: Account<'info, token::Mint>,

    // Required programs.
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

impl<'info> Initialize<'info> {
    pub fn initialize(
        &mut self,
        deal_id: u64,
        amount: u64,
        tier: Tier,
        buyer_deposit: u64,
        seller_deposit: u64,
        checklist_hash: [u8; 32],
        bumps: &InitializeBumps,
    ) -> Result<()> {
        
        // --- 1. BASIC SECURITY CHECKS ---
        require!(amount > 0, HandoffError::ZeroAmount);
        
        // --- 2. TIER VALIDATION ---
        match tier {
            Tier::Basic => {
                require!(buyer_deposit == 0 && seller_deposit == 0, HandoffError::BasicHasDeposits);
            }
            Tier::Advanced => {
                require!(buyer_deposit > 0 && seller_deposit > 0, HandoffError::AdvancedNeedsDeposits);
            }
        }

        // --- 3. CALCULATE TOTAL ---
        let total_to_lock = amount.checked_add(buyer_deposit).ok_or(HandoffError::InvalidStatus)?;

        // --- 4. MOVE THE MONEY (CPI) ---
        let cpi_accounts = Transfer {
            from: self.buyer_usdc.to_account_info(),
            to: self.escrow_vault.to_account_info(),
            authority: self.buyer.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(self.token_program.key(), cpi_accounts);
        token::transfer(cpi_ctx, total_to_lock)?;

        // --- 5. SAVE THE STATE ---
        let escrow = &mut self.escrow_state;
        escrow.buyer = self.buyer.key();
        escrow.seller = self.seller.key();
        escrow.arbitrator = self.arbitrator.key();
        escrow.mint = self.usdc_mint.key();
        escrow.deal_id = deal_id;
        escrow.tier = tier;
        escrow.amount = amount;
        escrow.buyer_deposit = buyer_deposit;
        escrow.seller_deposit = seller_deposit;
        escrow.price_released = false;
        escrow.checklist_hash = checklist_hash;
        escrow.file_hash = [0; 32];
        escrow.status = EscrowStatus::Initialized;
        
        escrow.delivery_deadline = 0;
        escrow.inspection_deadline = 0;
        escrow.warranty_deadline = 0;
        escrow.disputed_at = 0;
        
        escrow.bump = bumps.escrow_state;

        Ok(())
    }
}