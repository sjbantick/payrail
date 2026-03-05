const fs = require('node:fs');
const path = require('node:path');

const ENV_PATH = path.resolve(__dirname, '../../../.env');
const REGISTRY_KEY = 'ENDPOINT_REGISTRY_ADDRESS';

function upsertEnvVar(content, key, value) {
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  if (pattern.test(content)) {
    return content.replace(pattern, `${key}=${value}`);
  }

  if (content.length > 0 && !content.endsWith('\n')) {
    return `${content}\n${key}=${value}\n`;
  }

  return `${content}${key}=${value}\n`;
}

async function main() {
  if (!process.env.BASE_SEPOLIA_DEPLOYER_PRIVATE_KEY) {
    throw new Error('Missing BASE_SEPOLIA_DEPLOYER_PRIVATE_KEY in .env');
  }

  const [deployer] = await hre.ethers.getSigners();
  console.log(`Deploying with: ${deployer.address}`);

  const factory = await hre.ethers.getContractFactory('PayRailEndpointRegistry');
  const contract = await factory.deploy();
  await contract.waitForDeployment();

  const deployedAddress = await contract.getAddress();
  console.log(`PayRailEndpointRegistry deployed at: ${deployedAddress}`);

  const existingEnv = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
  const nextEnv = upsertEnvVar(existingEnv, REGISTRY_KEY, deployedAddress);
  fs.writeFileSync(ENV_PATH, nextEnv, 'utf8');

  console.log(`Updated ${ENV_PATH} with ${REGISTRY_KEY}.`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Deployment failed: ${message}`);
  process.exitCode = 1;
});
