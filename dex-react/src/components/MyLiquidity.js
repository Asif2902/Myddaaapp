import React, { useState, useEffect } from 'react';
import TokenModal from './TokenModal';
import { ethers } from 'ethers';
import { routerABI } from '../contracts/routerABI';
import { erc20ABI } from '../contracts/erc20ABI';
import { factoryABI } from '../contracts/factoryABI';
import { lpTokenABI } from '../contracts/lpTokenABI';

const ROUTER_ADDRESS = "0x144e18DB06B4553b94ED397610D2FBf809790545";
const FACTORY_ADDRESS = "0xc98d287eFCBbb177D641FD2105dEC57996335766";
const WMON_ADDRESS = "0xf6C4e67A551bd10444e3b439A4Eb19ec46eC1215";

function Liquidity({ wallet, notify, tokenList, setTokenList }) {
  const [selectedTokenA, setSelectedTokenA] = useState(null);
  const [selectedTokenB, setSelectedTokenB] = useState(null);
  const [amountA, setAmountA] = useState('');
  const [amountB, setAmountB] = useState('');
  const [balances, setBalances] = useState({ tokenA: '0', tokenB: '0' });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalTarget, setModalTarget] = useState('');
  const { provider, signer, userAddress } = wallet;

  useEffect(() => {
    const interval = setInterval(() => {
      fetchBalances();
    }, 15000);
    fetchBalances();
    return () => clearInterval(interval);
  }, [userAddress, selectedTokenA, selectedTokenB]);

  const fetchBalances = async () => {
    if (!userAddress) return;
    if (selectedTokenA) await fetchBalanceForToken(selectedTokenA, 'tokenA');
    if (selectedTokenB) await fetchBalanceForToken(selectedTokenB, 'tokenB');
  };

  const fetchBalanceForToken = async (token, key) => {
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
  };

  const abbreviateNumber = (num) => {
    if (num >= 1e12) return (num / 1e12).toFixed(2) + "T";
    if (num >= 1e9) return (num / 1e9).toFixed(2) + "B";
    if (num >= 1e6) return (num / 1e6).toFixed(2) + "M";
    if (num >= 1e3) return (num / 1e3).toFixed(2) + "K";
    return num.toFixed(5);
  };

  const isStable = async (tokenAddress) => {
    if (tokenAddress === "MON") return false;
    const factoryContract = new ethers.Contract(FACTORY_ADDRESS, factoryABI, provider);
    return await factoryContract.isStableCoin(tokenAddress);
  };

  useEffect(() => {
    const calculateAmountB = async () => {
      if (!selectedTokenA || !selectedTokenB || !amountA || parseFloat(amountA) <= 0) {
        setAmountB('');
        return;
      }
      let amountA_BN = ethers.utils.parseUnits(amountA, selectedTokenA.decimals);
      let tokenAForPair = selectedTokenA.address === "MON" ? WMON_ADDRESS : selectedTokenA.address;
      let tokenBForPair = selectedTokenB.address === "MON" ? WMON_ADDRESS : selectedTokenB.address;
      const factoryContract = new ethers.Contract(FACTORY_ADDRESS, factoryABI, provider);
      const pairAddress = await factoryContract.getPair(tokenAForPair, tokenBForPair);
      const isStableA = await isStable(tokenAForPair);
      const isStableB = await isStable(tokenBForPair);
      if (pairAddress !== ethers.constants.AddressZero) {
        const pairContract = new ethers.Contract(pairAddress, lpTokenABI, provider);
        const [reserve0, reserve1] = await pairContract.getReserves();
        let reserveA = tokenAForPair.toLowerCase() < tokenBForPair.toLowerCase() ? reserve0 : reserve1;
        let reserveB = tokenAForPair.toLowerCase() < tokenBForPair.toLowerCase() ? reserve1 : reserve0;
        if (reserveA.isZero()) return;
        let amountB;
        if (isStableA && isStableB) {
          const decimalsA = selectedTokenA.decimals;
          const decimalsB = selectedTokenB.decimals;
          amountB = amountA_BN.mul(ethers.BigNumber.from(10).pow(decimalsB)).div(ethers.BigNumber.from(10).pow(decimalsA));
        } else {
          amountB = amountA_BN.mul(reserveB).div(reserveA);
        }
        setAmountB(ethers.utils.formatUnits(amountB, selectedTokenB.decimals));
      }
    };
    calculateAmountB();
  }, [amountA, selectedTokenA, selectedTokenB]);

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

  const handleAddLiquidity = async () => {
    if (!selectedTokenA || !selectedTokenB) return notify("Select both tokens", "error");
    if (!amountA || parseFloat(amountA) <= 0) return notify("Enter a valid amount for Token A", "error");
    if (!amountB || parseFloat(amountB) <= 0) return notify("Enter a valid amount for Token B", "error");

    const amountA_BN = ethers.utils.parseUnits(amountA, selectedTokenA.decimals);
    const amountB_BN = ethers.utils.parseUnits(amountB, selectedTokenB.decimals);
    const tokenAForPair = selectedTokenA.address === "MON" ? WMON_ADDRESS : selectedTokenA.address;
    const tokenBForPair = selectedTokenB.address === "MON" ? WMON_ADDRESS : selectedTokenB.address;

    let balanceA, balanceB;
    if (selectedTokenA.address === "MON") {
      balanceA = await provider.getBalance(userAddress);
    } else {
      const tokenAContract = new ethers.Contract(selectedTokenA.address, erc20ABI, provider);
      balanceA = await tokenAContract.balanceOf(userAddress);
    }
    if (selectedTokenB.address === "MON") {
      balanceB = await provider.getBalance(userAddress);
    } else {
      const tokenBContract = new ethers.Contract(selectedTokenB.address, erc20ABI, provider);
      balanceB = await tokenBContract.balanceOf(userAddress);
    }
    if (balanceA.lt(amountA_BN)) return notify(`Insufficient ${selectedTokenA.symbol} balance`, "error");
    if (balanceB.lt(amountB_BN)) return notify(`Insufficient ${selectedTokenB.symbol} balance`, "error");

    try {
      const deadline = Math.floor(Date.now() / 1000) + 600;
      const routerContract = new ethers.Contract(ROUTER_ADDRESS, routerABI, signer);
      let tx;
      if (selectedTokenA.address === "MON" || selectedTokenB.address === "MON") {
        let token, amountTokenDesired, valueETH;
        if (selectedTokenA.address === "MON") {
          token = selectedTokenB;
          amountTokenDesired = amountB_BN;
          valueETH = amountA_BN;
        } else {
          token = selectedTokenA;
          amountTokenDesired = amountA_BN;
          valueETH = amountB_BN;
        }
        if (token.address !== "MON") await ensureApproval(token, amountTokenDesired, ROUTER_ADDRESS);
        tx = await routerContract.addLiquidityETH(
          token.address,
          amountTokenDesired,
          amountTokenDesired.mul(95).div(100),
          valueETH.mul(95).div(100),
          deadline,
          { value: valueETH, gasLimit: 6000000 }
        );
      } else {
        await ensureApproval(selectedTokenA, amountA_BN, ROUTER_ADDRESS);
        await ensureApproval(selectedTokenB, amountB_BN, ROUTER_ADDRESS);
        tx = await routerContract.addLiquidity(
          selectedTokenA.address,
          selectedTokenB.address,
          amountA_BN,
          amountB_BN,
          amountA_BN.mul(95).div(100),
          amountB_BN.mul(95).div(100),
          { gasLimit: 6000000 }
        );
      }
      notify("Adding liquidity...", "info");
      await tx.wait();
      notify("Liquidity added successfully", "success");
      fetchBalances();
    } catch (error) {
      console.error("Add liquidity error:", error);
      notify("Liquidity addition failed: " + (error.reason || error.message), "error");
    }
  };

  return (
    <section id="liquidityTab" className="tabContent">
      <h2>Add Liquidity</h2>
      <div className="liquidity-container">
        <div className="liquidity-input">
          <label>Token A</label>
          <div className="input-row">
            <div className="token-select" onClick={() => openTokenModal('tokenA')}>
              <img src={selectedTokenA?.logo || "https://via.placeholder.com/24"} alt="Token Logo" className="tokenLogo" />
              <span>{selectedTokenA?.symbol || "Select Token"}</span>
            </div>
            <input type="number" value={amountA} onChange={(e) => setAmountA(e.target.value)} placeholder="0" />
          </div>
          <div className="balanceInfo">Balance: {balances.tokenA}</div>
        </div>
        <div className="liquidity-input">
          <label>Token B</label>
          <div className="input-row">
            <div className="token-select" onClick={() => openTokenModal('tokenB')}>
              <img src={selectedTokenB?.logo || "https://via.placeholder.com/24"} alt="Token Logo" className="tokenLogo" />
              <span>{selectedTokenB?.symbol || "Select Token"}</span>
            </div>
            <input type="number" value={amountB} onChange={(e) => setAmountB(e.target.value)} placeholder="0" />
          </div>
          <div className="balanceInfo">Balance: {balances.tokenB}</div>
        </div>
        <button className="actionButton" onClick={handleAddLiquidity}>Add Liquidity</button>
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

export default Liquidity;