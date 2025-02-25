import { ChainId, CONTRACTS_ADDRESSES, registry } from '@angleprotocol/sdk/dist';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { Contract } from 'ethers';
import hre from 'hardhat';
import { DeployFunction } from 'hardhat-deploy/types';
import yargs from 'yargs';

import { expect } from '../test/hardhat/utils/chai-setup';
import { Treasury__factory, VaultManager__factory } from '../typechain';
import { deployProxy } from './helpers';
import params from './networks';
const argv = yargs.env('').boolean('ci').parseSync();

const func: DeployFunction = async ({ deployments, ethers, network }) => {
  /**
   * TODO: change implementation depending on what is being deployed
   */
  const implementationName = 'VaultManager_PermissionedLiquidations_Implementation';
  // const implementation = (await ethers.getContract(implementationName)).address;
  const implementation = '0x88fE06D438F5264dA8e2CDCAc3DAED1eA70F995a';

  const { deploy } = deployments;
  const { deployer } = await ethers.getNamedSigners();

  let proxyAdminAddress: string;

  const json = await import('./networks/' + network.name + '.json');
  const vaultsList = json.vaultsList;
  const stableName = 'EUR';
  let treasuryAddress;

  if (!network.live) {
    // If we're in mainnet fork, we're using the `ProxyAdmin` address from mainnet
    proxyAdminAddress = CONTRACTS_ADDRESSES[ChainId.MAINNET].ProxyAdmin!;
    treasuryAddress = registry(ChainId.MAINNET)?.agEUR?.Treasury!;
  } else {
    // Otherwise, we're using the proxy admin address from the desired network
    proxyAdminAddress = (await ethers.getContract('ProxyAdmin')).address;
    treasuryAddress = registry(network.config.chainId as ChainId)?.agEUR?.Treasury!;
  }

  console.log(`Deploying proxies for the following vaultManager: ${vaultsList}`);

  if (params.stablesParameters[stableName]?.vaultManagers) {
    for (const vaultManagerParams of params.stablesParameters[stableName]?.vaultManagers!) {
      const collat = vaultManagerParams.symbol.split('-')[0];
      const stable = vaultManagerParams.symbol.split('-')[1];
      if (!vaultsList.includes(collat)) continue;
      const name = `VaultManager_${collat}_${stable}`;
      const oracle = (await ethers.getContract(`Oracle_${vaultManagerParams.oracle}`)).address;

      console.log('Now deploying the Proxy for:', name);
      console.log(`The params for this vaultManager are:`);
      console.log(`collateral: ${vaultManagerParams.collateral}`);
      console.log(`oracle address: ${oracle}`);
      console.log(`symbol: ${vaultManagerParams.symbol}`);
      console.log(`debtCeiling: ${vaultManagerParams.params.debtCeiling.toString()}`);
      console.log(`collateralFactor: ${vaultManagerParams.params.collateralFactor.toString()}`);
      console.log(`targetHealthFactor: ${vaultManagerParams.params.targetHealthFactor.toString()}`);
      console.log(`borrowFee: ${vaultManagerParams.params.borrowFee.toString()}`);
      console.log(`repayFee: ${vaultManagerParams.params.repayFee.toString()}`);
      console.log(`interestRate: ${vaultManagerParams.params.interestRate.toString()}`);
      console.log(`liquidationSurcharge: ${vaultManagerParams.params.liquidationSurcharge.toString()}`);
      console.log(`maxLiquidationDiscount: ${vaultManagerParams.params.maxLiquidationDiscount.toString()}`);
      console.log(`baseBoost: ${vaultManagerParams.params.baseBoost.toString()}`);
      console.log(`whitelistingActivated: ${vaultManagerParams.params.whitelistingActivated.toString()}`);
      console.log('');

      const treasury = new Contract(treasuryAddress, Treasury__factory.abi, deployer);

      const callData = new ethers.Contract(
        implementation,
        VaultManager__factory.createInterface(),
      ).interface.encodeFunctionData('initialize', [
        treasury.address,
        vaultManagerParams.collateral,
        oracle,
        vaultManagerParams.params,
        vaultManagerParams.symbol,
      ]);
      await deploy(name, {
        contract: 'TransparentUpgradeableProxy',
        from: deployer.address,
        args: [implementation, proxyAdminAddress, callData],
        log: !argv.ci,
      });

      const vaultManagerAddress = (await deployments.get(name)).address;
      console.log(`Successfully deployed ${name} at the address ${vaultManagerAddress}`);
      console.log(`${vaultManagerAddress} ${implementation} ${proxyAdminAddress} ${callData}`);
      console.log('');
    }
  }

  console.log('Proxy deployments done');
};

func.tags = ['vaultManagerProxy'];
func.dependencies = ['oracle'];
export default func;
