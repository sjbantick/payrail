const assert = require('node:assert/strict');

describe('PayRailEndpointRegistry', function () {
  async function deployFixture() {
    const factory = await hre.ethers.getContractFactory('PayRailEndpointRegistry');
    const contract = await factory.deploy();
    await contract.waitForDeployment();
    return contract;
  }

  it('registers and returns a wallet by endpoint id', async function () {
    const contract = await deployFixture();
    const endpointId = hre.ethers.id('endpoint:/v1/forecast');
    const wallet = '0x2222222222222222222222222222222222222222';

    await contract.registerEndpoint(wallet, endpointId);
    const storedWallet = await contract.getWallet(endpointId);

    assert.equal(storedWallet, wallet);
  });

  it('allows updating an existing endpoint mapping', async function () {
    const contract = await deployFixture();
    const endpointId = hre.ethers.id('endpoint:/v1/forecast');
    const walletA = '0x2222222222222222222222222222222222222222';
    const walletB = '0x3333333333333333333333333333333333333333';

    await contract.registerEndpoint(walletA, endpointId);
    await contract.registerEndpoint(walletB, endpointId);

    const storedWallet = await contract.getWallet(endpointId);
    assert.equal(storedWallet, walletB);
  });

  it('reverts for zero wallet address', async function () {
    const contract = await deployFixture();
    const endpointId = hre.ethers.id('endpoint:/v1/forecast');

    await assert.rejects(
      () => contract.registerEndpoint(hre.ethers.ZeroAddress, endpointId),
      /ZeroWallet/,
    );
  });
});
