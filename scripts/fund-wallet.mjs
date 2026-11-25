import { JsonRpcProvider, getAddress, parseEther, toQuantity } from 'ethers';
import { assertLocalRpc } from './runtime.mjs';

const rpcUrl = process.env.RPC_URL || 'http://127.0.0.1:8545';
let provider;
try {
  assertLocalRpc(rpcUrl);
  if (!process.argv[2]) throw new Error('Usage: npm run fund -- 0xYourWalletAddress');
  const address = getAddress(process.argv[2]);
  provider = new JsonRpcProvider(rpcUrl);
  if ((await provider.getNetwork()).chainId !== 31337n) throw new Error('Only local development chain 31337 is allowed.');
  await provider.send('anvil_setBalance', [address, toQuantity(parseEther('10'))]);
  console.log(`Local test balance set to 10 ETH for ${address}. No real funds are involved.`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { provider?.destroy(); }
