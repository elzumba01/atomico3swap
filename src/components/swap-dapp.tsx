// @ts-nocheck
'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { AlertCircle, DollarSign, Sparkles, ArrowRightLeft } from 'lucide-react';
import { Alert, AlertDescription } from '../components/ui/alert';
import Web3 from 'web3';

// Contract addresses
const ATOMICO3_ADDRESS = '0x22a79a08ddb74a9f1a4ebe5da75300ad9f1aed76';
const USDT_ADDRESS = '0xc2132D05D31c914a87C6611C10748AEb04B58e8F';
const USDC_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
const ROUTER_ADDRESS = '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff';
const ATOMICO3_USDT_PAIR = '0x2e8f3b0e4ad32317f70f7f79a63a1538ded23fd4';

// ABIs
const ERC20_ABI = [
  {
    constant: true,
    inputs: [{ name: "_owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "balance", type: "uint256" }],
    type: "function"
  },
  {
    constant: true,
    inputs: [
      { name: "_owner", type: "address" },
      { name: "_spender", type: "address" }
    ],
    name: "allowance",
    outputs: [{ name: "", type: "uint256" }],
    type: "function"
  },
  {
    constant: false,
    inputs: [
      { name: "_spender", type: "address" },
      { name: "_value", type: "uint256" }
    ],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    type: "function"
  }
];

const ROUTER_ABI = [
  {
    inputs: [
      { internalType: "uint256", name: "amountIn", type: "uint256" },
      { internalType: "uint256", name: "amountOutMin", type: "uint256" },
      { internalType: "address[]", name: "path", type: "address[]" },
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "deadline", type: "uint256" }
    ],
    name: "swapExactTokensForTokens",
    outputs: [{ internalType: "uint256[]", name: "amounts", type: "uint256[]" }],
    stateMutability: "nonpayable",
    type: "function"
  }
];

const SwapDApp = () => {
  const [account, setAccount] = useState("");
  const [inputAmount, setInputAmount] = useState("");
  const [outputAmount, setOutputAmount] = useState("");
  const [tokenFrom, setTokenFrom] = useState("usdt");
  const [tokenTo, setTokenTo] = useState("at3");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [price, setPrice] = useState(null);
  const [balances, setBalances] = useState({
    usdt: "0",
    usdc: "0",
    at3: "0"
  });

  const tokens = {
    usdt: {
      symbol: "USDT",
      address: USDT_ADDRESS,
      decimals: 6,
      icon: <DollarSign className="h-5 w-5" />
    },
    usdc: {
      symbol: "USDC",
      address: USDC_ADDRESS,
      decimals: 6,
      icon: <DollarSign className="h-5 w-5" />
    },
    at3: {
      symbol: "AT3",
      address: ATOMICO3_ADDRESS,
      decimals: 18,
      icon: <Sparkles className="h-5 w-5" />
    }
  };

  const connectWallet = async () => {
    if (window.ethereum) {
      try {
        const accounts = await window.ethereum.request({
          method: "eth_requestAccounts"
        });
        setAccount(accounts[0]);
      } catch (err) {
        setError("Error al conectar la wallet: " + err.message);
      }
    } else {
      setError("Por favor instala MetaMask");
    }
  };

  const disconnectWallet = () => {
    setAccount("");
    setBalances({ usdt: "0", usdc: "0", at3: "0" });
    setPrice(null);
    setInputAmount("");
    setOutputAmount("");
  };

  const updateBalances = async () => {
    if (!account) return;
    const newBalances = {
      usdt: await fetchTokenBalance(tokens.usdt.address, tokens.usdt.decimals),
      usdc: await fetchTokenBalance(tokens.usdc.address, tokens.usdc.decimals),
      at3: await fetchTokenBalance(tokens.at3.address, tokens.at3.decimals)
    };
    setBalances(newBalances);
  };

  const fetchTokenBalance = async (tokenAddress, decimals) => {
    try {
      const data = `0x70a08231000000000000000000000000${account.slice(2).toLowerCase()}`;
      const response = await window.ethereum.request({
        method: "eth_call",
        params: [{ to: tokenAddress, data }, "latest"]
      });
      const balance = parseInt(response, 16) / (10 ** decimals);
      return balance.toFixed(6);
    } catch (err) {
      console.error("Error fetching balance:", err);
      return "0";
    }
  };

  const fetchPrice = async () => {
    try {
      const reservesData = {
        to: ATOMICO3_USDT_PAIR,
        data: "0x0902f1ac"
      };
      const reservesResult = await window.ethereum.request({
        method: "eth_call",
        params: [reservesData, "latest"]
      });
      const reserve0 = parseInt(reservesResult.slice(2, 66), 16);
      const reserve1 = parseInt(reservesResult.slice(66, 130), 16);
      const pricePerAT3 = (reserve1 / 1e6) / (reserve0 / 1e18);
      setPrice(pricePerAT3);
      if (inputAmount) {
        setOutputAmount(tokenFrom === "at3" ? 
          (inputAmount * pricePerAT3).toFixed(6) : 
          (inputAmount / pricePerAT3).toFixed(6)
        );
      }
    } catch (err) {
      console.error("Error fetching price:", err);
    }
  };

  const handleInputChange = (value) => {
    setInputAmount(value);
    if (!value) {
      setOutputAmount("");
      return;
    }
    if (price) {
      setOutputAmount(tokenFrom === "at3" ? 
        (value * price).toFixed(6) : 
        (value / price).toFixed(6)
      );
    }
  };

  const executeSwap = async () => {
    try {
      setLoading(true);
      setError("");
      setSuccess("");
      
      if (!account) throw new Error("Wallet no conectada");
      
      const web3 = new Web3(window.ethereum);
      const path = tokenFrom === "at3" 
        ? [ATOMICO3_ADDRESS, USDT_ADDRESS]
        : [USDT_ADDRESS, ATOMICO3_ADDRESS];
      
      const fromDecimals = tokens[tokenFrom].decimals;
      const amountIn = BigInt(Math.floor(parseFloat(inputAmount) * (10 ** fromDecimals)));
      const amountOutMin = BigInt(Math.floor(parseFloat(outputAmount) * 0.99 * (10 ** tokens[tokenTo].decimals)));
      const deadline = Math.floor(Date.now() / 1000) + 1200;
      
      const tokenContract = new web3.eth.Contract(ERC20_ABI, tokens[tokenFrom].address);
      const allowance = await tokenContract.methods.allowance(account, ROUTER_ADDRESS).call();
      
      if (BigInt(allowance) < amountIn) {
        const approveTx = await window.ethereum.request({
          method: "eth_sendTransaction",
          params: [{
            from: account,
            to: tokens[tokenFrom].address,
            data: tokenContract.methods.approve(ROUTER_ADDRESS, amountIn.toString()).encodeABI()
          }]
        });
        await waitForTransaction(approveTx);
      }
      
      const routerContract = new web3.eth.Contract(ROUTER_ABI, ROUTER_ADDRESS);
      const swapData = routerContract.methods.swapExactTokensForTokens(
        amountIn.toString(),
        amountOutMin.toString(),
        path,
        account,
        deadline
      ).encodeABI();
      
      const swapTx = await window.ethereum.request({
        method: "eth_sendTransaction",
        params: [{
          from: account,
          to: ROUTER_ADDRESS,
          data: swapData
        }]
      });
      
      await waitForTransaction(swapTx);
      await updateBalances();
      setSuccess("Swap completado con exito!");
      setInputAmount("");
      setOutputAmount("");
      
    } catch (err) {
      setError("Error al ejecutar swap: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const waitForTransaction = async (txHash) => {
    return new Promise((resolve, reject) => {
      const checkTransaction = async () => {
        try {
          const receipt = await window.ethereum.request({
            method: "eth_getTransactionReceipt",
            params: [txHash],
          });
          if (receipt) {
            if (receipt.status === "0x1") {
              resolve(receipt);
            } else {
              reject(new Error("Transaction failed"));
            }
          } else {
            setTimeout(checkTransaction, 1000);
          }
        } catch (error) {
          reject(error);
        }
      };
      checkTransaction();
    });
  };

  useEffect(() => {
    if (account) {
      updateBalances();
      fetchPrice();
      const interval = setInterval(fetchPrice, 20000);
      return () => clearInterval(interval);
    }
  }, [account]);

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-gray-800 border-gray-700 shadow-lg">
        <CardContent className="p-6">
          {!account ? (
            <Button 
              onClick={connectWallet} 
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            >
              Conectar Wallet
            </Button>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div className="text-sm text-gray-400">
                  {account.slice(0, 6)}...{account.slice(-4)}
                </div>
                <Button
                  onClick={disconnectWallet}
                  className="bg-red-600 hover:bg-red-700 text-white text-sm px-3 py-1"
                >
                  Desconectar
                </Button>
              </div>

              {price && (
                <div className="text-sm text-gray-400 bg-gray-900 p-2 rounded flex justify-between items-center">
                  <span>Precio AT3:</span>
                  <span className="text-blue-400">${price.toFixed(6)} USDT</span>
                </div>
              )}

              <div className="bg-gray-900 p-4 rounded-lg space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Pagar:</span>
                  <span className="text-gray-400">
                    Balance: {balances[tokenFrom]} {tokens[tokenFrom].symbol}
                  </span>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input
                    type="number"
                    value={inputAmount}
                    onChange={(e) => handleInputChange(e.target.value)}
                    className="bg-gray-800 border-none text-white text-lg flex-1"
                    placeholder="0.00"
                  />
                  <Button
                    className="bg-blue-600 hover:bg-blue-700 min-w-[120px] flex items-center justify-center gap-2"
                  >
                    {tokens[tokenFrom].icon} {tokens[tokenFrom].symbol}
                  </Button>
                </div>
              </div>

              <div className="flex justify-center">
                <Button
                  onClick={() => {
                    const temp = tokenFrom;
                    setTokenFrom(tokenTo);
                    setTokenTo(temp);
                    setInputAmount("");
                    setOutputAmount("");
                  }}
                  className="bg-gray-700 hover:bg-gray-600 rounded-full p-2"
                >
                  <ArrowRightLeft className="h-5 w-5" />
                </Button>
              </div>

              <div className="bg-gray-900 p-4 rounded-lg space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Recibir:</span>
                  <span className="text-gray-400">
                    Balance: {balances[tokenTo]} {tokens[tokenTo].symbol}
                  </span>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input
                    type="number"
                    value={outputAmount}
                    className="bg-gray-800 border-none text-white text-lg flex-1"
                    placeholder="0.00"
                    readOnly
                  />
                  <Button
                    className="bg-blue-600 hover:bg-blue-700 min-w-[120px] flex items-center justify-center gap-2"
                  >
                    {tokens[tokenTo].icon} {tokens[tokenTo].symbol}
                  </Button>
                </div>
              </div>

              <Button
                onClick={executeSwap}
                disabled={loading || !inputAmount}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              >
                {loading ? "Procesando..." : "Swap"}
              </Button>

              {error && (
                <Alert variant="destructive" className="bg-red-900/50 border border-red-900 text-red-400">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {success && (
                <Alert className="bg-green-900/50 border border-green-900 text-green-400">
                  <AlertDescription className="flex items-center gap-2">
                    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    {success}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SwapDApp;