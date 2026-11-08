// ==========================================================
// FILE: lib/dealState.ts
// PURPOSE: The "Brain" of the UI. It takes the current state 
// of the deal and the user's role, and outputs exactly what 
// buttons, text, and countdowns should be shown on screen.
// ==========================================================

import { CLOCK_SKEW_BUFFER_SECONDS, WINDOWS, type Windows } from './constants';
import { formatUsdc } from './format';
import type {
  ActionId,
  ButtonVariant,
  ClosedOutcome,
  ConfirmCopy,
  Deal,
  DealStatus,
  Panel,
  PanelAction,
  PanelCountdown,
  Role,
  Tone,
} from '../types/deal';

// ----------------------------------------------------------
// CONFIG
// ----------------------------------------------------------
export interface PanelConfig {
  windows: Windows;
  skewSeconds: number;
}

export const DEFAULT_PANEL_CONFIG: PanelConfig = {
  windows: WINDOWS,
  skewSeconds: CLOCK_SKEW_BUFFER_SECONDS,
};

// A helper to guarantee we never miss a state in a switch statement
export function assertNever(x: never): never {
  throw new Error(`Unhandled case: ${JSON.stringify(x)}`);
}

// ----------------------------------------------------------
// CLOSED OUTCOME
// ----------------------------------------------------------
// The smart contract doesn't store WHY a deal closed (only that it is closed).
// We figure it out by looking at what data was left behind.
export function deriveClosedOutcome(deal: Deal): ClosedOutcome {
  if (deal.disputedAt > 0) return 'dispute_settled';
  if (deal.priceReleased) return deal.tier === 'advanced' ? 'warranty_claimed' : 'released';
  return deal.deliveryDeadline === 0 ? 'cancelled' : 'refunded';
}

// ----------------------------------------------------------
// MAIN LOGIC: getPanel
// ----------------------------------------------------------
export interface PanelInput {
  status: DealStatus;
  role: Role;
  now: number; // The current time from the blockchain, not the browser clock
  deal: Deal;
  config?: PanelConfig;
}

interface Ctx {
  deal: Deal;
  role: Role;
  now: number;
  cfg: PanelConfig;
}

// Helper to check if a deadline has passed (including a 5-second safety buffer)
function hasPassed(ctx: Ctx, deadline: number): boolean {
  return ctx.now >= deadline + ctx.cfg.skewSeconds;
}

// Helper to check if a deadline is still in the future
function isBefore(ctx: Ctx, deadline: number): boolean {
  return ctx.now < deadline - ctx.cfg.skewSeconds;
}

// Helper to create a button object
function action(
  id: ActionId,
  label: string,
  variant: ButtonVariant,
  enabled: boolean,
  extra: { disabledReason?: string; confirm?: ConfirmCopy; input?: 'file_hash' } = {},
): PanelAction {
  return {
    id,
    label,
    variant,
    enabled,
    disabledReason: enabled ? undefined : extra.disabledReason,
    confirm: extra.confirm,
    input: extra.input,
  };
}

// Helper to create a countdown object
function countdown(label: string, deadline: number, totalSeconds: number): PanelCountdown {
  return { label, deadline, totalSeconds };
}

// The main function that the UI will call
export function getPanel(input: PanelInput): Panel {
  const ctx: Ctx = {
    deal: input.deal,
    role: input.role,
    now: input.now,
    cfg: input.config ?? DEFAULT_PANEL_CONFIG,
  };
  
  switch (input.status) {
    case 'initialized':
      return initializedPanel(ctx);
    case 'accepted':
      return acceptedPanel(ctx);
    case 'delivered':
      return deliveredPanel(ctx);
    case 'completed':
      return completedPanel(ctx);
    case 'disputed':
      return disputedPanel(ctx);
    case 'closed':
      return closedPanel(ctx);
    default:
      return assertNever(input.status);
  }
}

// ----------------------------------------------------------
// STATE: INITIALIZED
// ----------------------------------------------------------
function initializedPanel(ctx: Ctx): Panel {
  const { deal, role } = ctx;
  const advanced = deal.tier === 'advanced';

  if (role === 'seller') {
    return {
      kind: 'accept_deal',
      title: 'Accept this deal',
      description: advanced
        ? `Accepting locks your ${formatUsdc(deal.sellerDeposit)} USDC warranty deposit in the vault and starts the delivery clock.`
        : 'Accepting starts the delivery clock. You must deliver before it runs out.',
      actions: [action('accept_deal', 'Accept Deal', 'primary', true)],
    };
  }

  if (role === 'buyer') {
    return {
      kind: 'waiting_for_seller',
      title: 'Waiting for the seller to accept',
      description: 'Your funds are locked in the vault. If the seller never accepts, you can cancel and get everything back.',
      actions: [
        action('cancel_deal', 'Cancel deal', 'secondary', true, {
          confirm: {
            title: 'Cancel this deal?',
            body: 'Everything you locked is returned to your wallet.',
            confirmLabel: 'Cancel deal',
          },
        }),
      ],
    };
  }

  return {
    kind: 'waiting_for_seller',
    title: 'Waiting for the seller to accept',
    description: 'No action is available for your wallet on this deal.',
    actions: [],
  };
}

// ----------------------------------------------------------
// STATE: ACCEPTED
// ----------------------------------------------------------
function acceptedPanel(ctx: Ctx): Panel {
  const { deal, role, cfg } = ctx;
  const deadline = deal.deliveryDeadline;
  const open = isBefore(ctx, deadline);
  const expired = hasPassed(ctx, deadline);
  const cd = countdown('Delivery deadline', deadline, cfg.windows.delivery);

  const refund = (variant: ButtonVariant): PanelAction =>
    action('refund_buyer', 'Refund buyer', variant, expired, {
      disabledReason: 'Available once the delivery deadline passes.',
      confirm: {
        title: 'Refund the buyer?',
        body: deal.tier === 'advanced'
          ? 'The buyer receives the price, their deposit and the seller’s deposit.'
          : 'The buyer receives the price back.',
        confirmLabel: 'Refund buyer',
      },
    });

  if (role === 'seller') {
    return {
      kind: 'deliver_asset',
      title: 'Deliver the asset',
      description: open
        ? 'Submit the 32-byte hash of the encrypted file. The buyer’s inspection window starts when you deliver.'
        : 'The delivery window has closed. The buyer can now claim a refund.',
      countdown: cd,
      actions: [
        action('deliver_asset', 'Deliver Asset', 'primary', open, {
          disabledReason: 'The delivery window has closed.',
          input: 'file_hash',
        }),
      ],
    };
  }

  if (role === 'buyer') {
    return {
      kind: 'waiting_for_delivery',
      title: 'Waiting for the seller to deliver',
      description: expired
        ? 'The seller missed the deadline. You can take your refund.'
        : 'If the seller does not deliver before the deadline, you can claim a refund.',
      countdown: cd,
      actions: [refund(expired ? 'primary' : 'secondary')],
    };
  }

  return {
    kind: 'waiting_for_delivery',
    title: 'Waiting for the seller to deliver',
    description: 'Anyone can trigger the refund once the delivery deadline passes.',
    countdown: cd,
    actions: [refund('secondary')],
  };
}

// ----------------------------------------------------------
// STATE: DELIVERED
// ----------------------------------------------------------
function deliveredPanel(ctx: Ctx): Panel {
  const { deal, role, cfg } = ctx;
  const deadline = deal.inspectionDeadline;
  const canDispute = isBefore(ctx, deadline);
  const windowEnded = hasPassed(ctx, deadline);
  const advanced = deal.tier === 'advanced';
  const cd = countdown('Inspection window', deadline, cfg.windows.inspection);

  const autoRelease = (variant: ButtonVariant): PanelAction =>
    action('auto_release', 'Release funds', variant, windowEnded, {
      disabledReason: 'Available once the inspection window ends.',
    });

  if (role === 'buyer') {
    return {
      kind: 'review_delivery',
      title: 'Inspect the asset',
      description: canDispute
        ? 'Check the delivery against your checklist. Approve to release payment, or open a dispute if it is not as agreed.'
        : 'The inspection window has closed. You can still approve, or the seller can release the funds.',
      countdown: cd,
      actions: [
        action('approve_handoff', 'Approve & Release', 'primary', true, {
          confirm: {
            title: 'Release payment?',
            body: advanced
              ? 'The price goes to the seller now. Both deposits stay locked until the warranty ends.'
              : 'The price goes to the seller. This cannot be undone.',
            confirmLabel: 'Approve & Release',
          },
        }),
        action('open_dispute', 'Open Dispute', 'danger', canDispute, {
          disabledReason: 'The inspection window has closed.',
          confirm: {
            title: 'Open a dispute?',
            body: advanced
              ? 'Funds freeze until the arbitrator rules. If you lose, you lose your deposit.'
              : 'Funds freeze until the arbitrator rules.',
            confirmLabel: 'Open Dispute',
          },
        }),
      ],
    };
  }

  return {
    kind: 'waiting_for_buyer',
    title: 'Waiting for the buyer to inspect',
    description: role === 'seller'
      ? 'If the buyer does not respond before the window ends, you can release the funds yourself.'
      : 'Anyone can release the funds once the inspection window ends.',
    countdown: cd,
    actions: [autoRelease(role === 'seller' ? 'primary' : 'secondary')],
  };
}

// ----------------------------------------------------------
// STATE: COMPLETED
// ----------------------------------------------------------
function completedPanel(ctx: Ctx): Panel {
  const { deal, role, cfg } = ctx;
  const deadline = deal.warrantyDeadline;
  const cd = countdown('Warranty window', deadline, cfg.windows.warranty);
  
  const claim = (variant: ButtonVariant): PanelAction =>
    action('claim_warranty', 'Return deposits', variant, hasPassed(ctx, deadline), {
      disabledReason: 'Available once the warranty window ends.',
    });

  if (role === 'buyer') {
    const canDispute = isBefore(ctx, deadline);
    return {
      kind: 'warranty_window',
      title: 'Warranty is active',
      description: 'Payment is released. Both deposits stay locked until the warranty ends. Open a dispute if the asset stops working.',
      countdown: cd,
      actions: [
        action('open_dispute', 'Open Dispute', 'danger', canDispute, {
          disabledReason: 'The warranty window has closed.',
          confirm: {
            title: 'Open a warranty dispute?',
            body: 'The deposits freeze until the arbitrator rules. If you lose, you lose your deposit.',
            confirmLabel: 'Open Dispute',
          },
        }),
        claim('secondary'),
      ],
    };
  }

  return {
    kind: 'warranty_window',
    title: 'Warranty is active',
    description: 'Payment is released. Deposits are returned to both sides when the warranty ends.',
    countdown: cd,
    actions: [claim(role === 'seller' ? 'primary' : 'secondary')],
  };
}

// ----------------------------------------------------------
// STATE: DISPUTED
// ----------------------------------------------------------
function disputedPanel(ctx: Ctx): Panel {
  const { deal, role, cfg } = ctx;
  const deadline = deal.disputedAt + cfg.windows.dispute;

  if (role === 'arbitrator') {
    return {
      kind: 'arbitrator_ruling',
      title: 'Rule on this dispute',
      description: 'Review the delivered file against the checklist, then pick the winner. The payout is automatic.',
      countdown: countdown('Ruling deadline', deadline, cfg.windows.dispute),
      actions: [
        action('resolve_dispute_for_buyer', 'Rule for buyer', 'primary', true, {
          confirm: { title: 'Rule for the buyer?', body: 'This is final and pays the buyer.', confirmLabel: 'Rule for buyer' },
        }),
        action('resolve_dispute_for_seller', 'Rule for seller', 'secondary', true, {
          confirm: { title: 'Rule for the seller?', body: 'This is final and pays the seller.', confirmLabel: 'Rule for seller' },
        }),
      ],
    };
  }

  const canExpire = hasPassed(ctx, deadline);
  return {
    kind: 'dispute_frozen',
    title: 'Funds are frozen',
    description: 'The arbitrator is reviewing this dispute. If no ruling arrives before the deadline, anyone can return each side’s own funds.',
    countdown: countdown('Ruling deadline', deadline, cfg.windows.dispute),
    actions: [
      action('expire_dispute', 'Return funds', 'secondary', canExpire, {
        disabledReason: 'Available if the arbitrator has not ruled by the deadline.',
      }),
    ],
  };
}

// ----------------------------------------------------------
// STATE: CLOSED
// ----------------------------------------------------------
const OUTCOME_COPY: Record<ClosedOutcome, (deal: Deal) => { title: string; description: string }> = {
  cancelled: () => ({ title: 'Deal cancelled', description: 'The buyer cancelled before the seller accepted. Everything was returned.' }),
  refunded: (deal) => ({
    title: 'Deal refunded',
    description: deal.tier === 'advanced'
      ? 'The seller missed the delivery deadline. The buyer received the price, their deposit and the seller’s deposit.'
      : 'The seller missed the delivery deadline. The buyer received the price back.',
  }),
  released: () => ({ title: 'Funds released', description: 'The price was paid to the seller. This deal is complete.' }),
  warranty_claimed: () => ({ title: 'Warranty ended', description: 'The price was paid to the seller and both deposits were returned.' }),
  dispute_settled: () => ({ title: 'Dispute settled', description: 'The arbitrator ruled, or the dispute timed out. See the transaction history for the exact payout.' }),
};

function closedPanel(ctx: Ctx): Panel {
  const outcome = deriveClosedOutcome(ctx.deal);
  const copy = OUTCOME_COPY[outcome](ctx.deal);
  return { kind: 'deal_closed', ...copy, actions: [], outcome };
}

// ----------------------------------------------------------
// STATUS BADGES
// ----------------------------------------------------------
export interface StatusBadgeSpec {
  label: string;
  tone: Tone;
  className: string;
  dotClassName: string;
}

const TONE_CLASSES: Record<Tone, { badge: string; dot: string }> = {
  zinc: { badge: 'border-zinc-700 bg-zinc-800/40 text-zinc-300', dot: 'bg-zinc-400' },
  purple: { badge: 'border-[#9945FF]/40 bg-[#9945FF]/10 text-[#C4A1FF]', dot: 'bg-[#9945FF]' },
  amber: { badge: 'border-amber-500/40 bg-amber-500/10 text-amber-300', dot: 'bg-amber-400' },
  green: { badge: 'border-[#14F195]/40 bg-[#14F195]/10 text-[#14F195]', dot: 'bg-[#14F195]' },
  red: { badge: 'border-red-500/40 bg-red-500/10 text-red-400', dot: 'bg-red-400' },
};

const BASE_BADGE = 'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium';
const BASE_DOT = 'h-1.5 w-1.5 rounded-full';

function badge(label: string, tone: Tone): StatusBadgeSpec {
  return { label, tone, className: `${BASE_BADGE} ${TONE_CLASSES[tone].badge}`, dotClassName: `${BASE_DOT} ${TONE_CLASSES[tone].dot}` };
}

const CLOSED_BADGES: Record<ClosedOutcome, { label: string; tone: Tone }> = {
  cancelled: { label: 'Cancelled', tone: 'zinc' },
  refunded: { label: 'Refunded', tone: 'zinc' },
  released: { label: 'Completed', tone: 'green' },
  warranty_claimed: { label: 'Completed', tone: 'green' },
  dispute_settled: { label: 'Settled', tone: 'zinc' },
};

export function getStatusBadge(status: DealStatus, deal?: Deal): StatusBadgeSpec {
  switch (status) {
    case 'initialized': return badge('Initialized', 'zinc');
    case 'accepted': return badge('Accepted', 'purple');
    case 'delivered': return badge('Delivered', 'amber');
    case 'completed': return badge('Completed', 'green');
    case 'disputed': return badge('Disputed', 'red');
    case 'closed': {
      if (!deal) return badge('Closed', 'zinc');
      const { label, tone } = CLOSED_BADGES[deriveClosedOutcome(deal)];
      return badge(label, tone);
    }
    default: return assertNever(status);
  }
}

// ----------------------------------------------------------
// TIMELINE PROGRESS BAR
// ----------------------------------------------------------
export type StepKey = 'initialized' | 'accepted' | 'delivered' | 'completed';
export type StepState = 'done' | 'current' | 'upcoming';

export interface TimelineStep {
  key: StepKey;
  label: string;
  state: StepState;
}

export interface Timeline {
  steps: TimelineStep[];
  terminal: { label: string; tone: Tone } | null;
}

const STEP_ORDER: readonly { key: StepKey; label: string }[] = [
  { key: 'initialized', label: 'Initialized' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'completed', label: 'Completed' },
];

function progressOf(status: DealStatus, deal: Deal): { reached: number; terminal: Timeline['terminal']; allDone: boolean } {
  switch (status) {
    case 'initialized': return { reached: 0, terminal: null, allDone: false };
    case 'accepted': return { reached: 1, terminal: null, allDone: false };
    case 'delivered': return { reached: 2, terminal: null, allDone: false };
    case 'completed': return { reached: 3, terminal: null, allDone: false };
    case 'disputed':
      return { reached: deal.priceReleased ? 3 : 2, terminal: { label: 'Disputed', tone: 'red' }, allDone: false };
    case 'closed': {
      const outcome = deriveClosedOutcome(deal);
      switch (outcome) {
        case 'released': case 'warranty_claimed': return { reached: 3, terminal: null, allDone: true };
        case 'cancelled': return { reached: 0, terminal: { label: 'Cancelled', tone: 'zinc' }, allDone: false };
        case 'refunded': return { reached: 1, terminal: { label: 'Refunded', tone: 'zinc' }, allDone: false };
        case 'dispute_settled': return { reached: deal.priceReleased ? 3 : 2, terminal: { label: 'Settled', tone: 'zinc' }, allDone: false };
        default: return assertNever(outcome);
      }
    }
    default: return assertNever(status);
  }
}

export function getTimeline(status: DealStatus, deal: Deal): Timeline {
  const { reached, terminal, allDone } = progressOf(status, deal);
  const steps = STEP_ORDER.map(({ key, label }, index): TimelineStep => {
    let state: StepState;
    if (allDone) state = 'done';
    else if (terminal) state = index <= reached ? 'done' : 'upcoming';
    else if (index < reached) state = 'done';
    else if (index === reached) state = 'current';
    else state = 'upcoming';
    return { key, label, state };
  });
  return { steps, terminal };
}