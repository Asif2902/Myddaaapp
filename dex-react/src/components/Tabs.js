import React from 'react';

function Tabs({ activeTab, onTabChange }) {
  const tabs = [
    { id: 'swapTab', label: 'Swap' },
    { id: 'liquidityTab', label: 'Liquidity' },
    { id: 'myLiquidityTab', label: 'My Liquidity' }
  ];

  return (
    <nav>
      {tabs.map(tab => (
        <button
          key={tab.id}
          className={`tabButton ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}

export default Tabs;