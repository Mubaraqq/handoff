// ==========================================================
// FILE: types/deal.ts
// PURPOSE: Defines the TypeScript interfaces for the entire app.
// This ensures that everywhere we pass a "Deal" around, the app
// knows exactly what fields it has (buyer, seller, amounts, etc).
// ==========================================================

import type { PublicKey } from '@solana/web3.js';

// The two modes the smart contract supports
export type Tier = 'basic' | 'advanced';

// The exact states the smart contract can be in
export type DealStatus =
  | 'initialized'
  | 'accepted'
  | 'delivered'
  | 'completed'
  | 'disputed'
  | 'closed';

// The role of the person currently looking at the screen
export type Role = 'buyer' | 'seller' | 'arbitrator' | 'observer';

// The data structure we use to represent a Deal in the React app.
// This maps exactly to the data stored on the Solana blockchain.
export interface Deal {
  address: PublicKey;           // The PDA address of the escrow
  buyer: PublicKey;             // The wallet that locked the funds
  seller: PublicKey;            // The wallet receiving the funds
  arbitrator: PublicKey;        // The admin who resolves disputes
  mint: PublicKey;              // The token being traded (USDC)
  dealId: bigint;               // A unique ID for this specific deal
  tier: Tier;                   // Basic or Advanced
  amount: bigint;               // The price of the item
  buyerDeposit: bigint;         // The buyer's deposit (0 if Basic)
  sellerDeposit: bigint;        // The seller's deposit (0 if Basic)
  priceReleased: boolean;       // Has the main price been paid out yet?
  checklistHash: Uint8Array;    // The hash of the agreed terms
  fileHash: Uint8Array;         // The hash of the delivered file
  status: DealStatus;           // Current state of the escrow
  deliveryDeadline: number;     // Unix timestamp when seller must deliver
  inspectionDeadline: number;   // Unix timestamp when buyer must approve
  warrantyDeadline: number;     // Unix timestamp when warranty ends
  disputedAt: number;           // Unix timestamp when the dispute started
}

// If a deal is "closed", we want to know WHY it closed to show the right UI
export type ClosedOutcome =
  | 'cancelled'       // Buyer cancelled before seller accepted
  | 'refunded'        // Seller ghosted, buyer got a refund
  | 'released'        // Seller delivered, buyer approved
  | 'warranty_claimed'// Advanced deal finished successfully
  | 'dispute_settled';// Arbitrator stepped in

// The exact names of the functions in our smart contract
export type ActionId =
  | 'cancel_deal'
  | 'accept_deal'
  | 'deliver_asset'
  | 'refund_buyer'
  | 'approve_handoff'
  | 'auto_release'
  | 'open_dispute'
  | 'resolve_dispute_for_buyer'
  | 'resolve_dispute_for_seller'
  | 'claim_warranty'
  | 'expire_dispute';

// UI styling options for buttons
export type ButtonVariant = 'primary' | 'secondary' | 'danger';

// Text used when popping up a "Are you sure?" modal
export interface ConfirmCopy {
  title: string;
  body: string;
  confirmLabel: string;
}

// Defines a button we render in the Action Panel
export interface PanelAction {
  id: ActionId;
  label: string;
  variant: ButtonVariant;
  enabled: boolean;
  disabledReason?: string | undefined;
  confirm?: ConfirmCopy | undefined;
  input?: 'file_hash' | undefined;
}

// Defines a countdown timer (like the 72-hour approval window)
export interface PanelCountdown {
  label: string;
  deadline: number;
  totalSeconds: number;
}

// The 10 possible panels that can be shown in the Action Panel
export type PanelKind =
  | 'waiting_for_seller'
  | 'accept_deal'
  | 'waiting_for_delivery'
  | 'deliver_asset'
  | 'review_delivery'
  | 'waiting_for_buyer'
  | 'warranty_window'
  | 'dispute_frozen'
  | 'arbitrator_ruling'
  | 'deal_closed';

// The complete package that tells the UI what to show right now
export interface Panel {
  kind: PanelKind;
  title: string;
  description: string;
  countdown?: PanelCountdown | undefined;
  actions: PanelAction[];
  outcome?: ClosedOutcome | undefined;
}

// Colors used for the Status Badges (e.g., Initialized is zinc, Disputed is red)
export type Tone = 'zinc' | 'purple' | 'amber' | 'green' | 'red';