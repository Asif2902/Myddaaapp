import React, { useState } from 'react';
import { ethers } from 'ethers';
import { erc20ABI } from '../contracts/erc20ABI';

function TokenModal({ tokenList, setTokenList, onSelect, onClose, provider }) {
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearch = async (query) => {
    setSearchQuery(query);
    if (query.startsWith("0x") && query.length === 42) {
      try {
        const tokenContract = new ethers.Contract(query, erc20ABI, provider);
        const symbol = await tokenContract.symbol();
        const decimals = await tokenContract.decimals();
        const newToken = { symbol, address: query, decimals, logo: `https://via.placeholder.com/24?text=${symbol}` };
        if (!tokenList.some(t => t.address.toLowerCase() === query.toLowerCase())) {
          setTokenList(prev => {
            const updatedList = [...prev, newToken];
            localStorage.setItem("importedTokens", JSON.stringify(updatedList.filter(t => !tokenList.some(dt => dt.address === t.address))));
            return updatedList;
          });
        }
      } catch (error) {
        console.error("Invalid token address:", error);
      }
    }
  };

  const filteredTokens = tokenList.filter(token =>
    token.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
    token.address.toLowerCase() === searchQuery.toLowerCase()
  );

  return (
    <div className="modal" onClick={(e) => e.target.className === 'modal' && onClose()}>
      <div className="modal-content">
        <span className="close-modal" onClick={onClose}>×</span>
        <h3>Select a Token</h3>
        <input
          type="text"
          placeholder="Search by symbol or paste address"
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
        />
        <div id="tokenList" className="scrollable">
          {filteredTokens.map(token => (
            <div
              key={token.address}
              className="token-item"
              onClick={() => onSelect(token)}
            >
              <img src={token.logo || "https://via.placeholder.com/24?text=?"} alt={token.symbol} className="tokenLogo" />
              <span>{token.symbol}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default TokenModal;