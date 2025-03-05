import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import Tabs from './components/Tabs';
import Swap from './components/Swap';
import Liquidity from './components/Liquidity';
import MyLiquidity from './components/MyLiquidity';
import Notification from './components/Notification';
import { useWallet } from './utils/wallet';

function App() {
  const [activeTab, setActiveTab] = useState('swapTab');
  const [notification, setNotification] = useState({ message: '', type: '' });
  const wallet = useWallet();
  const [tokenList, setTokenList] = useState([]);

  const defaultTokens = [
    { symbol: "USDC", address: "0xf817257fed379853cDe0fa4F97AB987181B1E5Ea", decimals: 6, logo: "https://cryptologos.cc/logos/usd-coin-usdc-logo.png?v=023" },
    { symbol: "USDT", address: "0x88b8E2161DEDC77EF4ab7585569D2415a1C1055D", decimals: 6, logo: "https://cryptologos.cc/logos/tether-usdt-logo.png?v=040" },
    { symbol: "WMON", address: "0xf6C4e67A551bd10444e3b439A4Eb19ec46eC1215", decimals: 18, logo: "https://imagedelivery.net/cBNDGgkrsEA-b_ixIp9SkQ/I_t8rg_V_400x400.jpg/public" },
    { symbol: "MON", address: "MON", decimals: 18, logo: "https://cdn.prod.website-files.com/667c57e6f9254a4b6d914440/667d7104644c621965495f6e_LogoMark.svg" },
    { symbol: "StakeR", address: "0x774453B7A832c83a1BD4adB4ca1e332107432A8f", decimals: 18, logo: "https://ttt.0xasif.monster/20250303_043446.png" }
  ];

  useEffect(() => {
    const imported = JSON.parse(localStorage.getItem('importedTokens') || '[]');
    setTokenList([...defaultTokens, ...imported]);
  }, []);

  const notify = (message, type = 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification({ message: '', type: '' }), 3000);
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
  };

  return (
    <div id="app">
      <Header wallet={wallet} notify={notify} />
      <Tabs activeTab={activeTab} onTabChange={handleTabChange} />
      <main>
        {activeTab === 'swapTab' && <Swap wallet={wallet} notify={notify} tokenList={tokenList} setTokenList={setTokenList} />}
        {activeTab === 'liquidityTab' && <Liquidity wallet={wallet} notify={notify} tokenList={tokenList} setTokenList={setTokenList} />}
        {activeTab === 'myLiquidityTab' && <MyLiquidity wallet={wallet} notify={notify} tokenList={tokenList} />}
      </main>
      <Notification notification={notification} />
      <footer>
        <p>MON Testnet | Explorer: testnet.monadexplorer.com</p>
      </footer>
    </div>
  );
}

export default App;