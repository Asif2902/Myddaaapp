import React from 'react';

function Header({ wallet, notify }) {
  const { isConnected, userAddress, connectWallet } = wallet;

  const handleConnect = async () => {
    const success = await connectWallet();
    if (success) {
      notify(`Wallet connected: ${userAddress.slice(0, 6)}...`, 'success');
    } else {
      notify('Wallet connection failed', 'error');
    }
  };

  return (
    <header>
      <h1>A DEX V2</h1>
      {isConnected ? (
        <span>Connected: {userAddress.slice(0, 6)}...{userAddress.slice(-4)}</span>
      ) : (
        <button id="connectWallet" onClick={handleConnect}>Connect Wallet</button>
      )}
    </header>
  );
}

export default Header;