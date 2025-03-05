import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { factoryABI } from '../contracts/factoryABI';
import { lpTokenABI } from '../contracts/lpTokenABI';
import { erc20ABI } from '../contracts/erc20ABI';
import { routerABI } from '../contracts/routerABI';

const FACTORY_ADDRESS = "0xc98d287eFCBbb177D641FD2105dEC57996335766";
const ROUTER_ADDRESS = "0x144e18DB06B4553b94ED397610D2FBf809790545";
const WMON_ADDRESS = "0xf6C4e67A551bd10444e3b439A4Eb19ec46eC1215";

function MyLiquidity({ wallet, notify, tokenList }) {
  const [lpPositions, setLpPositions] = useState([]);
  const [selectedLP, setSelectedLP] = useState(null);
  const [removePercentage, setRemovePercentage] = useState(0);
  const { provider, signer, userAddress } = wallet;

  // Memoize fetchLPPositions
  const fetchLPPositions = useCallback(async () => {
    if (!userAddress) {
      console.log('No user address, skipping LP fetch');
      return;
    }
    console.log('Fetching LP positions for:', userAddress);
    const factoryContract = new ethers.Contract(FACTORY_ADDRESS, factoryABI, provider);
    try {
      const allPairsLength = await factoryContract.allPairsLength();
      console.log(`Total pairs: ${allPairsLength}`);
      let positions = [];
      for (let i = 0; i < allPairsLength; i++) {
        try {
          const pairAddress = await factoryContract.allPairs(i);
          if (pairAddress === ethers.constants.AddressZero) {
            console.log(`Pair ${i} is zero address, skipping`);
            continue;
          }
          const pairContract = new ethers.Contract(pairAddress, lpTokenABI, provider);
          const balance = await pairContract.balanceOf(userAddress);
          if (balance.gt(0)) {
            const token0 = await pairContract.token0();
            const token1 = await pairContract.token1();
            const token0Contract = new ethers.Contract(token0, erc20ABI, provider);
            const token1Contract = new ethers.Contract(token1, erc20ABI, provider);
            const symbol0 = await token0Contract.symbol();
            const symbol1 = await token1Contract.symbol();
            const balanceFormatted = ethers.utils.formatUnits(balance, 18);
            console.log(`Found LP: ${symbol0}-${symbol1}, Balance: ${balanceFormatted}`);
            positions.push({
              address: pairAddress,
              tokenA: token0,
              tokenB: token1,
              symbol: `${symbol0}-${symbol1} LP`,
              balance: balance.toString(),
              balanceFormatted,
            });
          }
        } catch (error) {
          console.error(`Error fetching pair ${i}:`, error);
        }
      }
      console.log('LP Positions fetched:', positions);
      setLpPositions(positions);
    } catch (error) {
      console.error('Error fetching allPairsLength:', error);
      notify('Failed to fetch liquidity positions', 'error');
    }
  }, [userAddress, provider, notify]);

  useEffect(() => {
    console.log('Setting up LP polling...');
    fetchLPPositions(); // Initial fetch
    const interval = setInterval(() => {
      fetchLPPositions();
    }, 15000);
    return () => {
      console.log('Cleaning up LP interval');
      clearInterval(interval);
    };
  }, [fetchLPPositions]);

  const handleLPSelect = (lp) => {
    console.log('Selected LP:', lp.symbol);
    setSelectedLP(lp);
  };

  const ensureApproval = async (token, amount, spender) => {
    if (token.address === "MON") return true;
    const tokenContract = new ethers.Contract(token.address, erc20ABI, signer);
    const allowance = await tokenContract.allowance(userAddress, spender);
    if (allowance.lt(amount)) {
      notify(`Approving ${token.symbol || 'LP'}...`, "info");
      const tx = await tokenContract.approve(spender, amount);
      await tx.wait();
      notify(`${token.symbol || 'LP'} approved successfully`, "success");
    }
    return true;
  };

  const handleRemoveLiquidity = async () => {
    if (!selectedLP) return notify("Select an LP token", "error");
    const lpBalance = ethers.BigNumber.from(selectedLP.balance);
    const amountToRemove = lpBalance.mul(ethers.BigNumber.from(Math.floor(removePercentage * 1e6))).div(ethers.BigNumber.from(1e6));
    console.log(`Removing ${removePercentage}% of ${selectedLP.symbol}, Amount: ${ethers.utils.formatUnits(amountToRemove, 18)}`);
    try {
      await ensureApproval({ address: selectedLP.address, decimals: 18 }, amountToRemove, ROUTER_ADDRESS);
      const routerContract = new ethers.Contract(ROUTER_ADDRESS, routerABI, signer);
      const deadline = Math.floor(Date.now() / 1000) + 600;
      const pairContract = new ethers.Contract(selectedLP.address, lpTokenABI, provider);
      const [reserve0, reserve1] = await pairContract.getReserves();
      const totalSupply = await pairContract.totalSupply();
      const token0 = await pairContract.token0();
      const token1 = await pairContract.token1();
      const reserveA = selectedLP.tokenA.toLowerCase() === token0.toLowerCase() ? reserve0 : reserve1;
      const reserveB = selectedLP.tokenA.toLowerCase() === token0.toLowerCase() ? reserve1 : reserve0;
      const expectedAmountA = totalSupply.gt(0) ? amountToRemove.mul(reserveA).div(totalSupply) : ethers.BigNumber.from(0);
      const expectedAmountB = totalSupply.gt(0) ? amountToRemove.mul(reserveB).div(totalSupply) : ethers.BigNumber.from(0);
      const amountAMin = expectedAmountA.mul(95).div(100);
      const amountBMin = expectedAmountB.mul(95).div(100);
      let tx;
      if (selectedLP.tokenA.toLowerCase() === WMON_ADDRESS.toLowerCase()) {
        tx = await routerContract.removeLiquidityETH(
          selectedLP.tokenB,
          amountToRemove,
          amountBMin,
          amountAMin,
          deadline,
          { gasLimit: 300000 }
        );
      } else if (selectedLP.tokenB.toLowerCase() === WMON_ADDRESS.toLowerCase()) {
        tx = await routerContract.removeLiquidityETH(
          selectedLP.tokenA,
          amountToRemove,
          amountAMin,
          amountBMin,
          deadline,
          { gasLimit: 300000 }
        );
      } else {
        tx = await routerContract.removeLiquidity(
          selectedLP.tokenA,
          selectedLP.tokenB,
          amountToRemove,
          amountAMin,
          amountBMin,
          { gasLimit: 300000 }
        );
      }
      notify("Removing liquidity...", "info");
      await tx.wait();
      notify("Liquidity removed successfully", "success");
      fetchLPPositions();
    } catch (error) {
      console.error("LP removal error:", error);
      notify("Liquidity removal failed: " + (error.reason || error.message), "error");
    }
  };

  const handleImportLP = async () => {
    const lpAddress = prompt("Enter LP token address:");
    if (!lpAddress || !ethers.utils.isAddress(lpAddress)) {
      notify("Invalid LP address", "error");
      return;
    }
    try {
      const lpContract = new ethers.Contract(lpAddress, lpTokenABI, provider);
      const balance = await lpContract.balanceOf(userAddress);
      if (balance.lte(0)) {
        notify("No balance found for this LP token", "error");
        return;
      }
      const token0 = await lpContract.token0();
      const token1 = await lpContract.token1();
      const token0Contract = new ethers.Contract(token0, erc20ABI, provider);
      const token1Contract = new ethers.Contract(token1, erc20ABI, provider);
      const symbol0 = await token0Contract.symbol();
      const symbol1 = await token1Contract.symbol();
      const balanceFormatted = ethers.utils.formatUnits(balance, 18);
      console.log(`Imported LP: ${symbol0}-${symbol1}, Balance: ${balanceFormatted}`);
      setLpPositions(prev => [
        ...prev,
        {
          address: lpAddress,
          tokenA: token0,
          tokenB: token1,
          symbol: `${symbol0}-${symbol1} LP`,
          balance: balance.toString(),
          balanceFormatted,
        },
      ]);
      notify("LP token imported successfully", "success");
    } catch (error) {
      console.error("Error importing LP:", error);
      notify("Failed to import LP: " + (error.reason || error.message), "error");
    }
  };

  return (
    <section id="myLiquidityTab" className="tabContent">
      <h2>My Liquidity Positions</h2>
      <div id="myLiquidityList" className="scrollable">
        {lpPositions.length === 0 ? (
          <p>No liquidity positions found.</p>
        ) : (
          lpPositions.map(lp => (
            <div
              key={lp.address}
              className={`lpTokenItem ${selectedLP?.address === lp.address ? 'selected' : ''}`}
              onClick={() => handleLPSelect(lp)}
            >
              {lp.symbol}: {lp.balanceFormatted}
            </div>
          ))
        )}
      </div>
      <button className="actionButton" onClick={handleImportLP}>
        Import LP Token
      </button>
      {selectedLP && (
        <div id="lpRemovalSection">
          <label htmlFor="removeSlider">
            Remove %: <span>{removePercentage}%</span>
          </label>
          <input
            type="range"
            id="removeSlider"
            min="0"
            max="99.9999"
            step="0.0001"
            value={removePercentage}
            onChange={(e) => setRemovePercentage(parseFloat(e.target.value))}
          />
          <button className="actionButton" onClick={handleRemoveLiquidity}>
            Remove Liquidity
          </button>
        </div>
      )}
    </section>
  );
}

export default MyLiquidity;