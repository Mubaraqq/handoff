// ==========================================================
// FILE: components/ui/index.tsx
// PURPOSE: Reusable UI building blocks (Buttons, Cards, Inputs)
// that we will use across all the screens to keep the design
// consistent and professional.
// ==========================================================

import React, { useState } from 'react';

// --- BUTTONS ---
// A reusable button with 3 variants: primary (green), secondary (dark), danger (red)
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
}

export function Button({ children, variant = 'primary', className = '', ...props }: ButtonProps) {
  const baseStyle = "h-11 px-5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all duration-200 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100";

  const variants = {
    primary:
      "bg-gradient-to-b from-[#14F195] to-[#0CD783] text-black " +
      "shadow-[0_0_0_0_rgba(20,241,149,0)] hover:shadow-[0_0_24px_rgba(20,241,149,0.25)] hover:brightness-110",
    secondary:
      "border border-gray-800 bg-[#0A0A0A] text-gray-200 " +
      "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)] " +
      "hover:bg-white/[0.04] hover:border-gray-700",
    danger:
      "border border-red-500/40 bg-red-500/10 text-red-400 " +
      "hover:bg-red-500/20 hover:border-red-500/60",
  };

  return (
    <button className={`${baseStyle} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}

// --- CARDS ---
// A dark container with a subtle border, used for the vault, forms, and panels.
// FIX: We now extend React.HTMLAttributes<HTMLDivElement> so we can pass onClick, etc.
interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function Card({ children, className = '', ...props }: CardProps) {
  return (
    <div
      className={`bg-[#0A0A0A] border border-gray-800 rounded-2xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)] transition-all duration-200 hover:border-gray-700/70 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

// --- INPUTS ---
// A dark text input with a green focus ring.
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, className = '', ...props }: InputProps) {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {label && <label className="text-sm font-medium text-gray-400">{label}</label>}
      <input
        className={`w-full bg-black border rounded-xl px-4 py-3 text-white placeholder-gray-600 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)] focus:outline-none focus:ring-2 transition-all duration-200 ${
          error
            ? 'border-red-500/50 focus:border-red-500 focus:ring-red-500/20'
            : 'border-gray-800 focus:border-[#14F195] focus:ring-[#14F195]/20'
        }`}
        {...props}
      />
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}

// --- MONOSPACE COPYABLE TEXT ---
// Used for wallet addresses and hashes. Truncates the text and shows a copy icon on hover.
export function CopyableMono({ value, className = '' }: { value: string, className?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Shorten the text if it's long (like a wallet address)
  const displayValue = value.length > 20
    ? `${value.slice(0, 6)}...${value.slice(-6)}`
    : value;

  return (
    <button
      onClick={handleCopy}
      className={`group flex items-center gap-1.5 font-mono text-xs text-gray-300 hover:text-white rounded-md px-1.5 py-0.5 hover:bg-white/5 transition-all duration-200 ${className}`}
      title="Click to copy"
    >
      <span>{displayValue}</span>
      <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        {copied ? '✓' : '📋'}
      </span>
    </button>
  );
}