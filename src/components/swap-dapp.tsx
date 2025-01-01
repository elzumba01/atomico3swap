'use client';

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: any[] }) => Promise<any>;
      on: (event: string, callback: (params: any) => void) => void;
    };
  }
}

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

const AT3_ADDRESS = '0x22a79a08ddb74a9f1a4ebe5da75300ad9f1aed76';
const USDT_ADDRESS = '0xc2132D05D31c914a87C6611C10748AEb04B58e8F';
const PAIR_ADDRESS = '0x2e8f3b0e4ad32317f70f7f79a63a1538ded23fd4';

const SwapDApp: React.FC = () => {
  const [account, setAccount] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [price, setPrice] = useState<string | null>(null);
  const [updateTime, setUpdateTime] = useState<string | null>(null);
  const [tradeType, setTradeType] = useState<'buy' | 'sell'>('buy');
  const [usdtBalance, setUsdtBalance] = useState<string>('0.00');
  const [at3Balance, setAt3Balance] = useState<string>('0.00');

  const getBalances = async (addr: string) => {
    if (!window.ethereum) return;
    const eth = window.ethereum;

    try {
      const usdtData = {
        to: USDT_ADDRESS,
        data: `0x70a08231${addr.slice(2).padStart(64, '0')}`
      };
      const usdtResult = await eth.request({
        method: 'eth_call',
        params: [usdtData, 'latest']
      });
      const usdtBal = parseInt(usdtResult, 16) / 1e6;
      setUsdtBalance(usdtBal.toFixed(2));

      const at3Data = {
        to: AT3_ADDRESS,
        data: `0x70a08231${addr.slice(2).padStart(64, '0')}`
      };
      const at3Result = await eth.request({
        method: 'eth_call',
        params: [at3Data, 'latest']
      });
      const at3Bal = parseInt(at3Result, 16) / 1e18;
      setAt3Balance(at3Bal.toFixed(2));
    } catch (err) {
      console.error('Balance error:', err);
    }
  };

  const getPrice = async () => {
    if (!window.ethereum) return;
    const eth = window.ethereum;

    try {
      const token0Result = await eth.request({
        method: 'eth_call',
        params: [{
          to: PAIR_ADDRESS,
          data: '0x0dfe1681'
        }, 'latest']
      });

      const token0 = '0x' + token0Result.slice(26).toLowerCase();
      const isAt3Token0 = token0 === AT3_ADDRESS.toLowerCase();

      const reservesResult = await eth.request({
        method: 'eth_call',
        params: [{
          to: PAIR_ADDRESS,
          data: '0x0902f1ac'
        }, 'latest']
      });

      const reserve0 = parseInt(reservesResult.slice(2, 66), 16);
      const reserve1 = parseInt(reservesResult.slice(66, 130), 16);

      const at3Reserve = isAt3Token0 ? reserve0 : reserve1;
      const usdtReserve = isAt3Token0 ? reserve1 : reserve0;

      const tokenPrice = (usdtReserve / 1e6) / (at3Reserve / 1e18);
      setPrice(tokenPrice.toFixed(6));
      setUpdateTime(new Date().toLocaleTimeString());
    } catch (error) {
      console.error('Price error:', error);
    }
  };

  const connectWallet = async () => {
    if (!window.ethereum) {
      setError('Please install MetaMask');
      return;
    }

    try {
      const eth = window.ethereum;
      const accounts = await eth.request({ method: 'eth_requestAccounts' });
      const newAccount = accounts[0];
      setAccount(newAccount);
      
      const chainId = await eth.request({ method: 'eth_chainId' });
      if (chainId !== '0x89') {
        setError('Switch to Polygon network');
        try {
          await eth.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0x89' }],
          });
        } catch (switchError: any) {
          if (switchError.code === 4902) {
            try {
              await eth.request({
                method: 'wallet_addEthereumChain',
                params: [{
                  chainId: '0x89',
                  chainName: 'Polygon',
                  nativeCurrency: {
                    name: 'MATIC',
                    symbol: 'MATIC',
                    decimals: 18
                  },
                  rpcUrls: ['https://polygon-rpc.com/'],
                  blockExplorerUrls: ['https://polygonscan.com/']
                }]
              });
            } catch (addError) {
              setError('Failed to add Polygon');
            }
          }
        }
      }

      await getBalances(newAccount);
    } catch (err: any) {
      setError('Connection failed');
    }
  };

  useEffect(() => {
    const setup = () => {
      if (!window.ethereum) return;
      const eth = window.ethereum;

      eth.on('accountsChanged', async (accounts: string[]) => {
        const newAccount = accounts[0] || '';
        setAccount(newAccount);
        if (newAccount) {
          await getBalances(newAccount);
        } else {
          setUsdtBalance('0.00');
          setAt3Balance('0.00');
        }
      });

      eth.on('chainChanged', (chainId: string) => {
        if (chainId !== '0x89') {
          setError('Switch to Polygon network');
        } else {
          setError('');
        }
      });
    };

    setup();
    getPrice();

    const interval = setInterval(getPrice, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="container mx-auto p-4">
      <Card className="max-w-md mx-auto bg-slate-900 border-slate-800">
        <CardHeader className="pb-3 border-b border-slate-800">
          <div className="flex justify-between items-center mb-4">
            <CardTitle className="text-lg font-medium text-gray-200">
              AT3 Swap
            </CardTitle>
            {account && (
              <button 
                onClick={() => setAccount('')}
                className="text-sm text-gray-400 hover:text-gray-300 flex items-center"
              >
                {account.slice(0, 6)}...{account.slice(-4)}
                <span className="ml-2">Disconnect</span>
              </button>
            )}
          </div>
          <div className="flex space-x-2">
            <Button 
              variant="ghost" 
              className={`flex-1 ${tradeType === 'buy' ? 'bg-slate-800 text-white' : 'text-gray-400'}`}
              onClick={() => setTradeType('buy')}
            >
              Buy
            </Button>
            <Button 
              variant="ghost" 
              className={`flex-1 ${tradeType === 'sell' ? 'bg-slate-800 text-white' : 'text-gray-400'}`}
              onClick={() => setTradeType('sell')}
            >
              Sell
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          {!account ? (
            <Button 
              onClick={connectWallet}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            >
              Connect Wallet
            </Button>
          ) : (
            <div className="space-y-4">              
              <div className="bg-slate-800 p-4 rounded-lg">
                <div className="flex justify-between mb-2">
                  <span className="text-sm text-gray-400">
                    {tradeType === 'buy' ? 'You Pay' : 'You Sell'}
                  </span>
                  <span className="text-sm text-gray-400">
                    Balance: {usdtBalance}
                  </span>
                </div>
                <div className="flex items-center">
                  <Input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="bg-transparent border-none text-xl text-white placeholder-gray-500 focus:outline-none focus:ring-0"
                    placeholder="0.0"
                  />
                  <div className="flex items-center bg-slate-700 rounded-lg px-3 py-1">
                    <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" fill="#26A17B"/>
                      <path d="M17.6 12.5c0-.3-.2-.4-.5-.4h-1v-1.3c0-1.1-.7-1.9-2.1-2.1V7.4h-.9v1.3h-.7V7.4h-.9v1.3H9.9v.9h.5c.4 0 .5.1.5.5v4.8c0 .3-.1.4-.5.4h-.5v.9h1.5v1.3h.9v-1.3h.7v1.3h.9v-1.3c1.5-.1 2.2-1 2.2-2.1v-1.3h1c.3 0 .5-.2.5-.4zm-2.4 1.8c0 .7-.4 1-1.2 1h-2v-2.1h2c.8 0 1.2.3 1.2 1v.1z" fill="white"/>
                    </svg>
                    <span className="text-white">USDT</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-center">
                <Button 
                  variant="ghost" 
                  className="rounded-full p-2 hover:bg-slate-800"
                  onClick={() => setTradeType(tradeType === 'buy' ? 'sell' : 'buy')}
                >
                  <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                  </svg>
                </Button>
              </div>

              <div className="bg-slate-800 p-4 rounded-lg">
                <div className="flex justify-between mb-2">
                  <span className="text-sm text-gray-400">
                    You Receive
                  </span>
                  <span className="text-sm text-gray-400">
                    Balance: {at3Balance}
                  </span>
                </div>
                <div className="flex items-center">
                  <div className="flex-1 text-xl text-white">
                    {amount && price ? (
                      tradeType === 'buy' 
                        ? (parseFloat(amount) / parseFloat(price)).toFixed(6)
                        : (parseFloat(amount) * parseFloat(price)).toFixed(6)
                    ) : '0.0'}
                  </div>
                  <div className="flex items-center bg-slate-700 rounded-lg px-3 py-1">
                    <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" fill="#3B82F6"/>
                      <text x="12" y="15" textAnchor="middle" fill="white" fontSize="8" fontWeight="bold">AT3</text>
                    </svg>
                    <span className="text-white">AT3</span>
                  </div>
                </div>
              </div>

              {price && (
                <div className="bg-slate-800/50 p-3 rounded-lg">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Price:</span>
                    <span className="text-gray-300">1 AT3 = {price} USDT</span>
                  </div>
                  <div className="flex justify-between text-xs mt-1">
                    <span className="text-gray-500">QuickSwap</span>
                    <span className="text-gray-500">Updated: {updateTime}</span>
                  </div>
                </div>
              )}

              <Button
                onClick={getPrice}
                disabled={loading || !amount}
                className={`w-full h-12 text-lg ${loading || !amount 
                  ? 'bg-slate-700 text-slate-500' 
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                {loading ? 'Processing...' : tradeType === 'buy' ? 'Buy AT3' : 'Sell AT3'}
              </Button>

              {error && (
                <Alert variant="destructive" className="bg-red-900/50 border border-red-900 text-red-400">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
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