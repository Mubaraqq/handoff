// ==========================================================
// FILE: error.rs
// PURPOSE: Defines custom errors. 
// When a transaction fails, the user sees these messages in Phantom.
// ==========================================================

use anchor_lang::prelude::*;

#[error_code]
pub enum HandoffError {
    #[msg("The buyer and seller cannot be the same wallet.")]
    InvalidRoles,
    
    #[msg("The arbitrator cannot be the buyer or the seller.")]
    InvalidArbitrator,
    
    #[msg("The escrow is not in the correct state for this action.")]
    InvalidStatus,
    
    #[msg("The timer has not expired yet.")]
    TimerNotExpired,
    
    #[msg("The timer has already expired.")]
    TimerExpired,
    
    #[msg("You are not authorized to perform this action.")]
    Unauthorized,

    #[msg("Buyer and seller must be different")] 
    BuyerIsSeller,
    #[msg("Arbitrator cannot be the buyer")] 
    ArbitratorIsBuyer,
    #[msg("Arbitrator cannot be the seller")] 
    ArbitratorIsSeller,
    #[msg("Amount must be greater than zero")] 
    ZeroAmount,
    #[msg("Basic deals cannot have deposits")] 
    BasicHasDeposits,
    #[msg("Advanced deals need both deposits")] 
    AdvancedNeedsDeposits,
}