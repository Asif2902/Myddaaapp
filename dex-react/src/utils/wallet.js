import { useState, useEffect } from 'react';
import { ethers } from 'ethers';

const PRIMARY_RPC = "https://testnet-rpc.monad.xyz";
const CHAIN_ID = 10143;
const CHAIN_HEX = "0x279f";

export function useWallet() {
  const [provider] = useState(new ethers.providers.StaticJsonRpcProvider(PRIMARY_RPC, { chainId: CHAIN_ID, name: "monad" }));
  const [signer, setSigner] = useState(null);
  const [userAddress, setUserAddress] = useState(null);
  const [currentChainId, setCurrentChainId] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  const connectWallet = async () => {
    if (window.ethereum) {
      try {
        await window.ethereum.request({ method: "eth_requestAccounts" });
        const web3Provider = new ethers.providers.Web3Provider(window.ethereum);
        const newSigner = web3Provider.getSigner();
        const address = await newSigner.getAddress();
        const chainId = (await web3Provider.getNetwork()).chainId;
        setSigner(newSigner);
        setUserAddress(address);
        setCurrentChainId(chainId);
        setIsConnected(true);
        if (chainId !== CHAIN_ID) {
          await switchToCorrectChain();
        }
        return true;
      } catch (error) {
        console.error("Wallet connection failed:", error);
        return false;
      }
    } else {
      console.error("No wallet provider found");
      return false;
    }
  };

  const switchToCorrectChain = async () => {
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: CHAIN_HEX }]
      });
      setCurrentChainId(CHAIN_ID);
    } catch (switchError) {
      console.error("Chain switch failed:", switchError);
    }
  };

  useEffect(() => {
    if (window.ethereum) {
      window.ethereum.on('chainChanged', (chainId) => {
        setCurrentChainId(parseInt(chainId, 16));
      });
      window.ethereum.on('accountsChanged', (accounts) => {
        if (accounts.length > 0) {
          setUserAddress(accounts[0]);
        } else {
          setIsConnected(false);
          setUserAddress(null);
          setSigner(null);
        }
      });
    }
  }, []);

  return {
    provider,
    signer,
    userAddress,
    currentChainId,
    isConnected,
    connectWallet,
    switchToCorrectChain
  };
}