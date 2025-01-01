'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ethers } from 'ethers';

interface WindowWithEthereum extends Window {
  ethereum?: {
    request: (args: { method: string; params?: any[] }) => Promise<any>;
    on: (event: string, callback: (params: any) => void) => void;
  }
}

declare const window: WindowWithEthereum;

const AT3_ADDRESS = '0x22a79a08ddb74a9f1a4ebe5da75300ad9f1aed76';
const USDT_ADDRESS = '0xc2132D05D31c914a87C6611C10748AEb04B58e8F';
const PAIR_ADDRESS = '0x2e8f3b0e4ad32317f70f7f79a63a1538ded23fd4';
const QUICKSWAP_ROUTER = '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff';

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

  const refreshData = async () => {
    if (account) {
      await getBalances(account);
      await getPrice();
    }
  };

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
      console.error('Error balances:', err);
    }
 ```javascript
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
    } catch (err) {
      console.error('Error price:', err);
    }
  };

  const connectWallet = async () => {
    if (!window.ethereum) {
      setError('Instala MetaMask');
      return;
    }

    try {
      const eth = window.ethereum;
      const accounts = await eth.request({ method: 'eth_requestAccounts' });
      const newAccount = accounts[0];
      setAccount(newAccount);

      const chainId = await eth.request({ method: 'eth_chainId' });
      if (chainId !== '0x89') {
        setError('Conecta a Polygon');
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
              setError('Error al agregar Polygon');
            }
          }
        }
      }

      await getBalances(newAccount);
    } catch (err: any) {
      setError('Error de conexion');
    }
  };

  const swapTokens = async () => {
    if (!window.ethereum) return;

    const eth = window.ethereum;
    const provider = new ethers.providers.Web3Provider(eth);
    const signer = provider.getSigner();

    const amountIn = ethers.utils.parseUnits(amount, 6); // USDT tiene 6 decimales
    const amountOutMin = 0; // Puedes calcular un mínimo aceptable
    const path = tradeType === 'buy' ? [USDT_ADDRESS, AT3_ADDRESS] : [AT3_ADDRESS, USDT_ADDRESS];
    const to = account; // La dirección que recibirá los tokens
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutos

    const routerContract = new ethers.Contract(QUICKSWAP_ROUTER, [
      'function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
    ], signer);

    try {
      setLoading(true);
      setError('');

      // Asegúrate de aprobar el gasto de USDT o AT3 antes de hacer el swap
      const tokenContract = new ethers.Contract(tradeType === 'buy' ? USDT_ADDRESS : AT3_ADDRESS, [
        'function approve(address spender, uint256 amount) public returns (bool)',
      ], signer);

      const approvalTx = await tokenContract.approve(QUICKSWAP_ROUTER, amountIn);
      await approvalTx.wait();

      // Realiza el swap
      const tx = await routerContract.swapExactTokensForTokens(amountIn, amountOutMin, path, to, deadline);
      await tx.wait();

      // Actualiza los balances después del swap
      await refreshData();
    } catch (err) {
      console ```javascript
      console.error('Error en el swap:', err);
      setError('Error al realizar el swap');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (account) {
      const interval = setInterval(refreshData, 60000);
      return () => clearInterval(interval);
    }
  }, [account]);

  useEffect(() => {
    if (window.ethereum) {
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
          setError('Conecta a Polygon');
        } else {
          setError('');
        }
      });

      getPrice();
    }
  }, []);

  return (
    <div className="container mx-auto p-4">
      <Card className="max-w-md mx-auto bg-slate-900 border-slate-800">
        <CardHeader className="pb-3 border-b border-slate-800">
          <div className="flex justify-between items-center mb-4">
            <CardTitle className="text-lg font-medium text-gray-200">
              ATOMICO 3
            </CardTitle>
            {account && (
              <button 
                onClick={() => setAccount('')}
                className="text-sm text-gray-400 hover:text-gray-300 flex items-center"
              >
                {account.slice(0, 6)}...{account.slice(-4)}
                <span className="ml-2">Desconectar</span>
              </button>
            )}
          </div>
          <div className="flex space-x-2">
            <Button 
              variant="ghost" 
              className={`flex-1 ${tradeType === 'buy' ? 'bg-slate-800 text-white' : 'text-gray-400'}`}
              onClick={() => setTradeType('buy')}
            >
              Comprar
            </Button>
            <Button 
              variant="ghost" 
              className={`flex-1 ${tradeType === 'sell' ? 'bg-slate-800 text-white' : 'text-gray-400'}`}
              onClick={() => setTradeType('sell')}
            >
              Vender
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          {!account ? (
            <Button 
              onClick={connectWallet}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            >
              Conectar Wallet
            </Button>
          ) : (
            <div className="space-y-4">              
              <div className="bg-slate-800 p-4 rounded-lg">
                <div className="flex justify-between mb-2">
                  <span className="text-sm text-gray-400">
                    {tradeType === 'buy' ? 'Pagas' : 'Vendes'}
                  </span>
                  <span className="text-sm text-gray-400 flex items-center">
                    <span>Balance: {usdtBalance} USDT</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-2 p-1 h-6 text-gray-400 hover:text-white"
                      onClick={refreshData}
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </Button>
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
                  <div className="flex items-center bg ```javascript
                    -slate-700 rounded-lg px-3 py-1">
                    <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" fill="#26A17B"/>
                      <text x="12" y="16" textAnchor="middle" fill="white" fontSize="10">$</text>
                    </svg>
                    <span className="text-white">USDT</span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-800 p-4 rounded-lg">
                <div className="flex justify-between mb-2">
                  <span className="text-sm text-gray-400">
                    Recibes
                  </span>
                  <span className="text-sm text-gray-400">
                    Balance: {at3Balance} AT3
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
                      <text x="12" y="16" textAnchor="middle" fill="white" fontSize="8">AT3</text>
                    </svg>
                    <span className="text-white">AT3</span>
                  </div>
                </div>
              </div>

              {price && (
                <div className="bg-slate-800/50 p-3 rounded-lg">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Precio:</span>
                    <span className="text-gray-300">1 AT3 = {price} USDT</span>
                  </div>
                  <div className="flex justify-between text-xs mt-1">
                    <span className="text-gray-500">QuickSwap</span>
                    <span className="text-gray-500">
                      Actualizado: {updateTime}
                    </span>
                  </div>
                </div>
              )}

              <Button
                onClick={swapTokens}
                disabled={loading || !amount}
                className={`w-full h-12 text-lg ${loading || !amount 
                  ? 'bg-slate-700 text-slate-500' 
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                {loading ? 'Procesando...' : tradeType === 'buy' ? 'Comprar AT3' : 'Vender AT3'}
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

export default SwapDApp