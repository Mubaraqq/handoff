// ==========================================================
// FILE: lib.rs
// PURPOSE: The entry point. Routes instructions to their handlers.
// ==========================================================

use anchor_lang::prelude::*;

pub mod state;
pub mod error;
pub mod instructions;

pub use state::*;
pub use error::*;
pub use instructions::*;

// Expose the initialize struct to the root to prevent macro errors
pub use instructions::initialize::*;
pub use instructions::cancel_deal::*;
pub use instructions::accept_deal::*;
pub use instructions::deliver_asset::*;
pub use instructions::approve_handoff::*;
pub use instructions::auto_release::*;
pub use instructions::refund_buyer::*;
pub use instructions::open_dispute::*;
pub use instructions::resolve_dispute::*;
pub use instructions::claim_warranty::*;
pub use instructions::expire_dispute::*;


declare_id!("A3ei9dw6ScZ8Wmcw54h7RrtbyexRetGrZv8vxjRtoY9G");

#[program]
pub mod handoff {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        deal_id: u64,
        amount: u64,
        tier: Tier, // The enum from state.rs
        buyer_deposit: u64,
        seller_deposit: u64,
        checklist_hash: [u8; 32],
    ) -> Result<()> {
        ctx.accounts.initialize(
            deal_id,
            amount,
            tier,
            buyer_deposit,
            seller_deposit,
            checklist_hash,
            &ctx.bumps
        )
    }

    pub fn cancel_deal(ctx: Context<CancelDeal>) -> Result<()> {
    ctx.accounts.cancel_deal()
    }

    pub fn accept_deal(ctx: Context<AcceptDeal>) -> Result<()> {
    ctx.accounts.accept_deal()
    }

    pub fn deliver_asset(ctx: Context<DeliverAsset>, file_hash: [u8; 32]) -> Result<()> {
    ctx.accounts.deliver_asset(file_hash)
    }

    pub fn approve_handoff(ctx: Context<ApproveHandoff>) -> Result<()> {
    ctx.accounts.approve_handoff()
    }

    pub fn auto_release(ctx: Context<AutoRelease>) -> Result<()> {
    ctx.accounts.auto_release()
    }

    pub fn refund_buyer(ctx: Context<RefundBuyer>) -> Result<()> {
    ctx.accounts.refund_buyer()
    }

    pub fn open_dispute(ctx: Context<OpenDispute>) -> Result<()> {
    ctx.accounts.open_dispute()
    }

    pub fn resolve_dispute(ctx: Context<ResolveDispute>, buyer_wins: bool) -> Result<()> {
    ctx.accounts.resolve_dispute(buyer_wins)
    }

    pub fn claim_warranty(ctx: Context<ClaimWarranty>) -> Result<()> {
    ctx.accounts.claim_warranty()
    }

    pub fn expire_dispute(ctx: Context<ExpireDispute>) -> Result<()> {
    ctx.accounts.expire_dispute()
    }

}