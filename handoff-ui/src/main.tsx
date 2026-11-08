// ==========================================================
// FILE: src/main.tsx
// PURPOSE: The entry point. Wraps the app in the Solana 
// Wallet Provider and our custom Demo Role Provider.
// ==========================================================

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import '@solana/wallet-adapter-react-ui/styles.css'

// Import our custom provider that handles the demo burner wallets
import { DemoRoleProvider } from './lib/demo/DemoRoleContext'

// Connect to Solana Devnet
const endpoint = "https://api.devnet.solana.com"

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={[]} autoConnect>
        <WalletModalProvider>
          <DemoRoleProvider>
            <App />
          </DemoRoleProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  </React.StrictMode>,
)