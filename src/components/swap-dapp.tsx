'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '../components/ui/alert';

// Direcciones de contratos en Polygon
const ATOMICO3_ADDRESS = '0x22a79a08ddb74a9f1a4ebe5da75300ad9f1aed76';
const USDT_ADDRESS = '0xc2132D05D31c914a87C6611C10748AEb04B58e8F';
const USDC_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
const ROUTER_ADDRESS = '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff'; // QuickSwap Router
const ATOMICO3_USDT_PAIR = '0x2e8f3b0e4ad32317f70f7f79a63a1538ded23fd4';

// Router ABI m铆nimo para el swap
const ROUTER_ABI = [
  {
    "inputs": [
      {"internalType": "uint256", "name": "amountIn", "type": "uint256"},
      {"internalType": "uint256", "name": "amountOutMin", "type": "uint256"},
      {"internalType": "address[]", "name": "path", "type": "address[]"},
      {"internalType": "address", "name": "to", "type": "address"},
      {"internalType": "uint256", "name": "deadline", "type": "uint256"}
    ],
    "name": "swapExactTokensForTokens",
    "outputs": [{"internalType": "uint256[]", "name": "amounts", "type": "uint256[]"}],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

// Funci贸n auxiliar para codificar los datos del swap
const encodeSwapData = (amountIn, amountOutMin, path, to, deadline) => {
  // Method ID for swapExactTokensForTokens (0x38ed1739)
  const methodId = '0x38ed1739';
  
  // Convertir los n煤meros a hex strings de 32 bytes
  const amountInHex = amountIn.toString(16).padStart(64, '0');
  const amountOutMinHex = amountOutMin.toString(16).padStart(64, '0');
  const toAddressHex = to.slice(2).padStart(64, '0');
  const deadlineHex = deadline.toString(16).padStart(64, '0');
  
  // Offset para el array de path (5 * 32 = 160 = 0xa0)
  const pathOffsetHex = '00000000000000000000000000000000000000000000000000000000000000a0';
  
  // Longitud del array path (2 elementos)
  const pathLengthHex = '0000000000000000000000000000000000000000000000000000000000000002';
  
  // Direcciones del path
  const pathAddressesHex = path.map(addr => 
    addr.slice(2).toLowerCase().padStart(64, '0')
  ).join('');
  
  // Concatenar todo
  return methodId + 
         amountInHex +
         amountOutMinHex +
         pathOffsetHex +
         toAddressHex +
         deadlineHex +
         pathLengthHex +
         pathAddressesHex;
};

const SwapDApp = () => {
  const [account, setAccount] = useState('');
  const [inputAmount, setInputAmount] = useState('');
  const [outputAmount, setOutputAmount] = useState('');
  const [tokenFrom, setTokenFrom] = useState('usdt');
  const [tokenTo, setTokenTo] = useState('at3');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [price, setPrice] = useState(null);
  const [swapAnimation, setSwapAnimation] = useState(false);
  const [balances, setBalances] = useState({
    usdt: '0',
    usdc: '0',
    at3: '0'
  });

  const tokens = {
    usdt: { 
      symbol: 'USDT', 
      address: USDT_ADDRESS, 
      decimals: 6,
      icon: '馃挷'
    },
    usdc: { 
      symbol: 'USDC', 
      address: USDC_ADDRESS, 
      decimals: 6,
      icon: '馃挼'
    },
    at3: { 
      symbol: 'AT3', 
      address: ATOMICO3_ADDRESS, 
      decimals: 18,
      icon: '馃敺'
    }
  };

  const fetchTokenBalance = async (tokenAddress, decimals) => {
    try {
      const data = `0x70a08231000000000000000000000000${account.slice(2).toLowerCase()}`;
      const response = await window.ethereum.request({
        method: 'eth_call',
        params: [{
          to: tokenAddress,
          data: data
        }, 'latest']
      });
      const balance = parseInt(response, 16) / (10 ** decimals);
      return balance.toFixed(6);
    } catch (err) {
      console.error('Error fetching balance:', err);
      return '0';
    }
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

  const fetchPrice = async () => {
    try {
      const reservesData = {
        to: ATOMICO3_USDT_PAIR,
        data: '0x0902f1ac' // getReserves selector
      };

      const reservesResult = await window.ethereum.request({
        method: 'eth_call',
        params: [reservesData, 'latest']
      });

      const reserve0 = parseInt(reservesResult.slice(2, 66), 16);
      const reserve1 = parseInt(reservesResult.slice(66, 130), 16);
      
      // Precio USDT/AT3
      const pricePerAT3 = (reserve1 / 1e6) / (reserve0 / 1e18);
      setPrice(pricePerAT3);

      // Actualizar output amount si hay input
      if (inputAmount) {
        if (tokenFrom === 'at3') {
          setOutputAmount((inputAmount * pricePerAT3).toFixed(6));
        } else {
          setOutputAmount((inputAmount / pricePerAT3).toFixed(6));
        }
      }
    } catch (err) {
      console.error('Error fetching price:', err);
    }
  };

  const handleInputChange = (value) => {
    setInputAmount(value);
    if (!value) {
      setOutputAmount('');
      return;
    }

    if (price) {
      if (tokenFrom === 'at3') {
        setOutputAmount((value * price).toFixed(6));
      } else {
        setOutputAmount((value / price).toFixed(6));
      }
    }
  };

  const swapTokens = () => {
    const temp = tokenFrom;
    setTokenFrom(tokenTo);
    setTokenTo(temp);
    setInputAmount('');
    setOutputAmount('');
  };

  const estimateGas = async (txParams) => {
    try {
      console.log('Estimando gas para transacci贸n:', txParams);

      // Primero obtener el precio actual del gas
      const gasPrice = await window.ethereum.request({
        method: 'eth_gasPrice'
      });
      console.log('Gas Price actual:', gasPrice);

      // Estimar el gas necesario
      const estimatedGas = await window.ethereum.request({
        method: 'eth_estimateGas',
        params: [txParams]
      });
      console.log('Gas estimado:', estimatedGas);

      // A帽adir un 50% de margen al gas estimado para mayor seguridad
      const gasLimit = Math.floor(parseInt(estimatedGas, 16) * 1.5).toString(16);
      console.log('Gas limit con margen:', gasLimit);

      return {
        gas: '0x' + gasLimit,
        gasPrice: gasPrice
      };
    } catch (err) {
      console.error('Error detallado en estimaci贸n de gas:', err);
      // Si falla la estimaci贸n, usar valores por defecto seguros
      return {
        gas: '0x7A120', // 500,000 gas
        gasPrice: '0x2540BE400' // 10 GWEI
      };
    }
  };

  const waitForTransaction = async (txHash, timeout = 60000) => {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      try {
        const receipt = await window.ethereum.request({
          method: 'eth_getTransactionReceipt',
          params: [txHash],
        });

        if (receipt) {
          // Verificar si la transacci贸n fue exitosa
          if (receipt.status === '0x1') {
            return true;
          } else {
            throw new Error('Transacci贸n fallida');
          }
        }

        // Esperar 2 segundos antes de intentar de nuevo
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (err) {
        console.error('Error al verificar transacci贸n:', err);
        throw err;
      }
    }
    
    throw new Error('Timeout esperando confirmaci贸n de la transacci贸n');
  };

  const executeSwap = async () => {
    try {
      setLoading(true);
      setError('');
      setSuccess('');
      setSwapAnimation(true);

      if (!account) {
        throw new Error('Wallet no conectada');
      }

      // Obtener direcci贸n del token que se est谩 vendiendo
      const tokenAddress = tokens[tokenFrom].address;
      
      // Convertir el monto a la cantidad correcta de decimales
      const decimals = tokens[tokenFrom].decimals;
      const amountWithDecimals = Math.floor(parseFloat(inputAmount) * (10 ** decimals));
      
      // Preparar datos de aprobaci贸n
      const approveParams = {
        from: account,
        to: tokenAddress,
        data: `0x095ea7b3${ROUTER_ADDRESS.slice(2).padStart(64, '0')}${amountWithDecimals.toString(16).padStart(64, '0')}`
      };

      // Estimar gas para la aprobaci贸n
      const approveGas = await estimateGas(approveParams);
      const approveData = {
        ...approveParams,
        ...approveGas
      };

      // Enviar transacci贸n de aprobaci贸n
      const approveTxHash = await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [approveData],
      });

      // Esperar confirmaci贸n de la aprobaci贸n
      let approveConfirmed = false;
      while (!approveConfirmed) {
        const receipt = await window.ethereum.request({
          method: 'eth_getTransactionReceipt',
          params: [approveTxHash],
        });
        if (receipt) {
          approveConfirmed = true;
        } else {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      // Crear la data para el swap
      // Calcular el path correcto seg煤n la direcci贸n del swap
      const path = [
        tokenFrom === 'at3' ? ATOMICO3_ADDRESS : (tokenFrom === 'usdt' ? USDT_ADDRESS : USDC_ADDRESS),
        tokenTo === 'at3' ? ATOMICO3_ADDRESS : (tokenTo === 'usdt' ? USDT_ADDRESS : USDC_ADDRESS)
      ];

      console.log('Path del swap:', path);

      // Calcular amountOutMin con 1% de slippage
      const amountOutMin = Math.floor(parseFloat(outputAmount) * 0.99 * (10 ** tokens[tokenTo].decimals));
      const deadline = Math.floor(Date.now() / 1000) + 300; // 5 minutos

      console.log('Par谩metros del swap:', {
        tokenFrom,
        tokenTo,
        amountIn: amountWithDecimals,
        amountOutMin,
        path,
        deadline
      });

      // Preparar datos del swap
      const swapParams = {
        from: account,
        to: ROUTER_ADDRESS,
        value: '0x0',
        data: encodeSwapData(amountWithDecimals, amountOutMin, path, account, deadline)
      };

      // Estimar gas para el swap
      const swapGas = await estimateGas(swapParams);
      const swapData = {
        ...swapParams,
        ...swapGas
      };

      console.log('Swap Parameters:', {
        amountIn: amountWithDecimals.toString(),
        amountOutMin: amountOutMin.toString(),
        path: path,
        to: account,
        deadline: deadline,
        estimatedGas: swapGas
      });

      // Enviar transacci贸n de swap
      const swapTxHash = await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [swapData],
      });

      // Esperar confirmaci贸n del swap
      let swapConfirmed = false;
      while (!swapConfirmed) {
        const receipt = await window.ethereum.request({
          method: 'eth_getTransactionReceipt',
          params: [swapTxHash],
        });
        if (receipt) {
          swapConfirmed = true;
        } else {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      // Actualizar balances despu茅s del swap
      await updateBalances();
      
      // Mostrar mensaje de 茅xito
      setSuccess('隆Swap completado con 茅xito!');
      
      // Limpiar campos
      setInputAmount('');
      setOutputAmount('');
      
    } catch (err) {
      setError('Error al ejecutar swap: ' + err.message);
    } finally {
      setLoading(false);
      setSwapAnimation(false);
    }
  };

  const connectWallet = async () => {
    try {
      if (window.ethereum) {
        const accounts = await window.ethereum.request({ 
          method: 'eth_requestAccounts' 
        });
        setAccount(accounts[0]);
        
        const chainId = await window.ethereum.request({ 
          method: 'eth_chainId' 
        });
        
        if (chainId !== '0x89') {
          setError('Por favor, conecta tu wallet a la red Polygon');
          try {
            await window.ethereum.request({
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: '0x89' }],
            });
          } catch (switchError) {
            if (switchError.code === 4902) {
              try {
                await window.ethereum.request({
                  method: 'wallet_addEthereumChain',
                  params: [{
                    chainId: '0x89',
                    chainName: 'Polygon Mainnet',
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
                setError('Error al agregar la red Polygon');
              }
            }
          }
        }
      } else {
        setError('Por favor, instala MetaMask');
      }
    } catch (err) {
      setError('Error al conectar wallet: ' + err.message);
    }
  };

  useEffect(() => {
    if (account) {
      updateBalances();
      fetchPrice();
      
      const interval = setInterval(fetchPrice, 20000);
      return () => clearInterval(interval);
    }
  }, [account]);

  useEffect(() => {
    if (window.ethereum) {
      window.ethereum.on('accountsChanged', (accounts) => {
        setAccount(accounts[0] || '');
      });

      window.ethereum.on('chainChanged', (chainId) => {
        if (chainId !== '0x89') {
          setError('Por favor, conecta tu wallet a la red Polygon');
        } else {
          setError('');
        }
      });
    }
  }, []);

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-slate-800 border-slate-700">
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
              <div className="text-sm text-gray-400">
                Conectado: {account.slice(0, 6)}...{account.slice(-4)}
              </div>
              
              {price && (
                <div className="text-sm text-gray-400 bg-slate-900 p-2 rounded flex justify-between items-center">
                  <span>Precio AT3:</span>
                  <span className="text-blue-400">${price.toFixed(6)} USDT</span>
                </div>
              )}
              
              <div className="bg-slate-900 p-4 rounded-lg space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Pagar:</span>
                  <span className="text-gray-400">
                    Balance: {balances[tokenFrom]} {tokens[tokenFrom].symbol}
                  </span>
                </div>
                
                <div className="flex gap-2">
                  <Input
                    type="number"
                    value={inputAmount}
                    onChange={(e) => handleInputChange(e.target.value)}
                    className="bg-slate-800 border-none text-white text-lg"
                    placeholder="0.00"
                  />
                  <Button
                    onClick={() => {/* Token selection logic */}}
                    className="bg-blue-600 hover:bg-blue-700 min-w-[120px] flex items-center gap-2"
                  >
                    {tokens[tokenFrom].icon} {tokens[tokenFrom].symbol}
                  </Button>
                </div>
              </div>

              <div className="flex justify-center">
                <Button
                  onClick={swapTokens}
                  className={`bg-slate-700 hover:bg-slate-600 rounded-full p-2 transition-transform duration-300 ${
                    swapAnimation ? 'animate-spin' : ''
                  }`}
                >
                  鈫?
                </Button>
              </div>

              <div className="bg-slate-900 p-4 rounded-lg space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Recibir:</span>
                  <span className="text-gray-400">
                    Balance: {balances[tokenTo]} {tokens[tokenTo].symbol}
                  </span>
                </div>
                
                <div className="flex gap-2">
                  <Input
                    type="number"
                    value={outputAmount}
                    className="bg-slate-800 border-none text-white text-lg"
                    placeholder="0.00"
                    readOnly
                  />
                  <Button
                    onClick={() => {/* Token selection logic */}}
                    className="bg-blue-600 hover:bg-blue-700 min-w-[120px] flex items-center gap-2"
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
                {loading ? 'Procesando...' : 'Swap'}
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
