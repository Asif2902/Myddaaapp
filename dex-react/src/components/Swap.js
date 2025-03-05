import React, { useState, useEffect, useCallback } from 'react';
import TokenModal from './TokenModal';
import { ethers } from 'ethers';
import { routerABI } from '../contracts/routerABI';
import { erc20ABI } from '../contracts/erc20ABI';
import { factoryABI } from '../contracts/factoryABI';
import { wmonABI } from '../contracts/wmonABI';
import { lpTokenABI } from '../contracts/lpTokenABI';

const ROUTER_ADDRESS = "0x144e18DB06B4553b94ED397610D2FBf809790545";
const FACTORY_ADDRESS = "0xc98d287eFCBbb177D641FD2105dEC57996335766";
const WMON_ADDRESS = "0xf6C4e67A551bd10444e3b439A4Eb19ec46eC1215";

function Swap({ wallet, notify, tokenList, setTokenList }) {
  const [selectedTokenA, setSelectedTokenA] = useState(tokenList.find(t => t.symbol === "MON"));
  const [selectedTokenB, setSelectedTokenB] = useState(tokenList.find(t => t.symbol === "USDT"));
  const [amountIn, setAmountIn] = useState('');
  const [amountOut, setAmountOut] = useState('');
  const [priceImpact, setPriceImpact] = useState('0%');
  const [balances, setBalances] = useState({ tokenA: '0', tokenB: '0' });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalTarget, setModalTarget] = useState('');
  const { provider, signer, userAddress } = wallet;

  const abbreviateNumber = (num) => {
    if (num >= 1e12) return (num / 1e12).toFixed(2) + "T";
    if (num >= 1e9) return (num / 1e9).toFixed(2) + "B";
    if (num >= 1e6) return (num / 1e6).toFixed(2) + "M";
    if (num >= 1e3) return (num / 1e3).toFixed(2) + "K";
    return num.toFixed(5);
  };

  // Memoized function to fetch the balance for a given token
  const fetchBalanceForToken = useCallback(async (token, key) => {
    try {
      let balance;
      if (token.address === "MON") {
        balance = await provider.getBalance(userAddress);
      } else {
        const tokenContract = new ethers.Contract(token.address, erc20ABI, provider);
        balance = await tokenContract.balanceOf(userAddress);
      }
      balance = ethers.utils.formatUnits(balance, token.decimals);
      setBalances(prev => ({ ...prev, [key]: abbreviateNumber(parseFloat(balance)) }));
    } catch (error) {
      console.error(`Error fetching balance for ${token.symbol}:`, error);
    }
  }, [provider, userAddress]);

  // Memoized function to fetch balances for both tokens
  const fetchBalances = useCallback(async () => {
    if (!userAddress) return;
    if (selectedTokenA) await fetchBalanceForToken(selectedTokenA, 'tokenA');
    if (selectedTokenB) await fetchBalanceForToken(selectedTokenB, 'tokenB');
  }, [userAddress, selectedTokenA, selectedTokenB, fetchBalanceForToken]);

  // Update balances every 15 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchBalances();
    }, 15000);
    fetchBalances();
    return () => clearInterval(interval);
  }, [fetchBalances]);

  // Memoized isStable function to check for stable coins
  const isStable = useCallback(async (tokenAddress) => {
    if (tokenAddress === "MON") return false;
    const factoryContract = new ethers.Contract(FACTORY_ADDRESS, factoryABI, provider);
    return await factoryContract.isStableCoin(tokenAddress);
  }, [provider]);

  // Memoized function to calculate the price impact
  const calculatePriceImpact = useCallback(async (tokenIn, tokenOut, amountInRaw) => {
    if (!tokenIn || !tokenOut || !amountInRaw || parseFloat(amountInRaw) <= 0) return "0%";
    if ((tokenIn.symbol === "MON" && tokenOut.symbol === "WMON") || 
        (tokenIn.symbol === "WMON" && tokenOut.symbol === "MON")) {
      return "0% (1:1)";
    }
    const isStableIn = await isStable(tokenIn.address);
    const isStableOut = await isStable(tokenOut.address);
    if (isStableIn && isStableOut) return "0% (Stable)";
    const amountIn = ethers.utils.parseUnits(amountInRaw, tokenIn.decimals);
    let tokenA = tokenIn.address === "MON" ? WMON_ADDRESS : tokenIn.address;
    let tokenB = tokenOut.address === "MON" ? WMON_ADDRESS : tokenOut.address;
    const factoryContract = new ethers.Contract(FACTORY_ADDRESS, factoryABI, provider);
    const pairAddress = await factoryContract.getPair(tokenA, tokenB);
    if (pairAddress === ethers.constants.AddressZero) return "N/A (No Pair)";
    const pairContract = new ethers.Contract(pairAddress, lpTokenABI, provider);
    const [reserve0, reserve1] = await pairContract.getReserves();
    const token0 = await pairContract.token0();
    let reserveA = tokenA.toLowerCase() === token0.toLowerCase() ? reserve0 : reserve1;
    let reserveB = tokenA.toLowerCase() === token0.toLowerCase() ? reserve1 : reserve0;
    if (reserveA.isZero() || reserveB.isZero()) return "0% (Empty Reserves)";
    const currentPrice = reserveB.mul(ethers.BigNumber.from(10).pow(18)).div(reserveA);
    const routerContract = new ethers.Contract(ROUTER_ADDRESS, routerABI, provider);
    const path = [tokenA, tokenB];
    const amountsOut = await routerContract.getAmountsOut(amountIn, path);
    const amountOut = amountsOut[1];
    if (amountOut.isZero()) return "100% (No liquidity)";
    const effectivePrice = amountOut.mul(ethers.BigNumber.from(10).pow(18)).div(amountIn);
    const priceImpactBN = currentPrice.sub(effectivePrice).mul(10000).div(currentPrice);
    return (priceImpactBN.toNumber() / 100).toFixed(2) + "%";
  }, [provider, isStable]);

  // Update swap output when input amount or tokens change
  useEffect(() => {
    const calculateOutput = async () => {
      if (!selectedTokenA || !selectedTokenB || !amountIn || parseFloat(amountIn) <= 0) {
        setAmountOut('0');
        setPriceImpact('0%');
        return;
      }
      try {
        let amountInBN = ethers.utils.parseUnits(amountIn, selectedTokenA.decimals);
        const isStableIn = await isStable(selectedTokenA.address);
        const isStableOut = await isStable(selectedTokenB.address);
        if ((selectedTokenA.symbol === "MON" && selectedTokenB.symbol === "WMON") ||
            (selectedTokenA.symbol === "WMON" && selectedTokenB.symbol === "MON")) {
          setAmountOut(amountIn);
          setPriceImpact("0% (1:1)");
        } else if (isStableIn && isStableOut) {
          setAmountOut(amountIn);
          setPriceImpact("0% (Stable)");
        } else {
          const routerContract = new ethers.Contract(ROUTER_ADDRESS, routerABI, provider);
          let path = [
            selectedTokenA.address === "MON" ? WMON_ADDRESS : selectedTokenA.address,
            selectedTokenB.address === "MON" ? WMON_ADDRESS : selectedTokenB.address
          ];
          let amountsOut = await routerContract.getAmountsOut(amountInBN, path);
          let amountOutBN = amountsOut[amountsOut.length - 1];
          setAmountOut(ethers.utils.formatUnits(amountOutBN, selectedTokenB.decimals));
          setPriceImpact(await calculatePriceImpact(selectedTokenA, selectedTokenB, amountIn));
        }
      } catch (error) {
        console.error("Error calculating swap output:", error);
        setAmountOut('Error');
        setPriceImpact('Error');
      }
    };
    calculateOutput();
  }, [amountIn, selectedTokenA, selectedTokenB, provider, isStable, calculatePriceImpact]);

  const openTokenModal = (target) => {
    setModalTarget(target);
    setIsModalOpen(true);
  };

  const handleTokenSelect = (token) => {
    if (modalTarget === 'tokenA') setSelectedTokenA(token);
    else if (modalTarget === 'tokenB') setSelectedTokenB(token);
    setIsModalOpen(false);
    fetchBalances();
  };

  const handleMax = async () => {
    if (!selectedTokenA) return notify("Select a token first", "error");
    let balance;
    if (selectedTokenA.address === "MON") {
      balance = await provider.getBalance(userAddress);
    } else {
      const tokenContract = new ethers.Contract(selectedTokenA.address, erc20ABI, provider);
      balance = await tokenContract.balanceOf(userAddress);
    }
    setAmountIn(ethers.utils.formatUnits(balance, selectedTokenA.decimals));
  };

  const handleSwitch = () => {
    setSelectedTokenA(selectedTokenB);
    setSelectedTokenB(selectedTokenA);
    setAmountIn('');
    setAmountOut('');
    fetchBalances();
  };

  const ensureApproval = async (token, amount, spender) => {
    if (token.address === "MON") return true;
    const tokenContract = new ethers.Contract(token.address, erc20ABI, signer);
    const allowance = await tokenContract.allowance(userAddress, spender);
    if (allowance.lt(amount)) {
      notify(`Approving ${token.symbol}...`, "info");
      const tx = await tokenContract.approve(spender, amount);
      await tx.wait();
      notify(`${token.symbol} approved successfully`, "success");
    }
    return true;
  };

  const wrapMon = async (amount) => {
    const wmonContract = new ethers.Contract(WMON_ADDRESS, wmonABI, signer);
    const tx = await wmonContract.deposit({ value: amount });
    notify("Wrapping MON to WMON...", "info");
    await tx.wait();
    notify("Wrapped successfully", "success");
  };

  const unwrapMon = async (amount) => {
    const wmonContract = new ethers.Contract(WMON_ADDRESS, wmonABI, signer);
    const tx = await wmonContract.withdraw(amount);
    notify("Unwrapping WMON to MON...", "info");
    await tx.wait();
    notify("Unwrapped successfully", "success");
  };

  const handleSwap = async () => {
    if (!selectedTokenA || !selectedTokenB) return notify("Select both tokens", "error");
    if (!amountIn || parseFloat(amountIn) <= 0) return notify("Enter a valid amount", "error");
    let amountInBN = ethers.utils.parseUnits(amountIn, selectedTokenA.decimals);
    try {
      if ((selectedTokenA.symbol === "MON" && selectedTokenB.symbol === "WMON") ||
          (selectedTokenA.symbol === "WMON" && selectedTokenB.symbol === "MON")) {
        if (selectedTokenA.symbol === "MON") {
          await wrapMon(amountInBN);
        } else {
          await unwrapMon(amountInBN);
        }
        fetchBalances();
        return;
      }
      const routerContract = new ethers.Contract(ROUTER_ADDRESS, routerABI, signer);
      let deadline = Math.floor(Date.now() / 1000) + 600;
      let tx;
      const isStableIn = await isStable(selectedTokenA.address);
      const isStableOut = await isStable(selectedTokenB.address);
      if (isStableIn && isStableOut) {
        await ensureApproval(selectedTokenA, amountInBN, ROUTER_ADDRESS);
        tx = await routerContract.swapExactStableForStable(
          amountInBN,
          selectedTokenA.address,
          selectedTokenB.address,
          deadline
        );
      } else {
        let path = [
          selectedTokenA.address === "MON" ? WMON_ADDRESS : selectedTokenA.address,
          selectedTokenB.address === "MON" ? WMON_ADDRESS : selectedTokenB.address
        ];
        let amountsOut = await routerContract.getAmountsOut(amountInBN, path);
        let expectedOut = amountsOut[amountsOut.length - 1];
        let amountOutMin = expectedOut.mul(95).div(100);
        if (selectedTokenA.address === "MON") {
          tx = await routerContract.swapExactETHForTokens(
            amountOutMin,
            path,
            deadline,
            { value: amountInBN }
          );
        } else if (selectedTokenB.address === "MON") {
          await ensureApproval(selectedTokenA, amountInBN, ROUTER_ADDRESS);
          tx = await routerContract.swapExactTokensForETH(
            amountInBN,
            amountOutMin,
            path,
            deadline
          );
        } else {
          await ensureApproval(selectedTokenA, amountInBN, ROUTER_ADDRESS);
          tx = await routerContract.swapExactTokensForTokens(
            amountInBN,
            amountOutMin,
            path
          );
        }
      }
      notify("Swap transaction sent", "info");
      await tx.wait();
      notify("Swap executed successfully", "success");
      fetchBalances();
    } catch (error) {
      console.error("Swap error:", error);
      notify("Swap failed: " + (error.reason || error.message), "error");
    }
  };

  return (
    <section id="swapTab" className="tabContent active">
      <h2>Swap Tokens</h2>
      <div className="swap-container">
        <div className="swap-input">
          <label>From</label>
          <div className="input-row">
            <div className="token-select" onClick={() => openTokenModal('tokenA')}>
              <img src={selectedTokenA?.logo || "https://via.placeholder.com/24"} alt="Token Logo" className="tokenLogo" />
              <span>{selectedTokenA?.symbol || "Select Token"}</span>
            </div>
            <input type="number" value={amountIn} onChange={(e) => setAmountIn(e.target.value)} placeholder="0" />
            <button onClick={handleMax}>MAX</button>
          </div>
          <div className="balanceInfo">Balance: {balances.tokenA}</div>
        </div>
        <button className="switchButton" onClick={handleSwitch}>⇆</button>
        <div className="swap-input">
          <label>To</label>
          <div className="input-row">
            <div className="token-select" onClick={() => openTokenModal('tokenB')}>
              <img src={selectedTokenB?.logo || "https://via.placeholder.com/24"} alt="Token Logo" className="tokenLogo" />
              <span>{selectedTokenB?.symbol || "Select Token"}</span>
            </div>
            <input type="number" value={amountOut} readOnly placeholder="0" />
          </div>
          <div className="balanceInfo">Balance: {balances.tokenB}</div>
        </div>
        <div className="priceImpactInfo">Price Impact: {priceImpact}</div>
        <button className="actionButton" onClick={handleSwap}>Swap</button>
      </div>
      {isModalOpen && (
        <TokenModal
          tokenList={tokenList}
          setTokenList={setTokenList}
          onSelect={handleTokenSelect}
          onClose={() => setIsModalOpen(false)}
          provider={provider}
        />
      )}
    </section>
  );
}

export default Swap;