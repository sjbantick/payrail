require('dotenv').config({ path: '../../.env' });
require('@nomicfoundation/hardhat-ethers');

const baseRpcUrl = process.env.BASE_RPC_URL || 'https://sepolia.base.org';
const deployerPrivateKey = process.env.BASE_SEPOLIA_DEPLOYER_PRIVATE_KEY;

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: '0.8.24',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {},
    baseSepolia: {
      url: baseRpcUrl,
      chainId: 84532,
      accounts: deployerPrivateKey ? [deployerPrivateKey] : [],
    },
  },
};
