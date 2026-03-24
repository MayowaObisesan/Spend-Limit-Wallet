const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const isTestnet = network.name === "rskTestnet";

  console.log("Network:", network.name, `(Chain ID: ${chainId})`);
  console.log("Deploying SpendLimitWallet...");
  console.log("Deployer:", deployer.address);
  console.log(
    "Balance:",
    ethers.formatEther(await ethers.provider.getBalance(deployer.address)),
    isTestnet ? "tRBTC" : "ETH"
  );

  // 1 tRBTC/ETH daily limit, 24-hour window
  const dailyLimit = ethers.parseEther("1.0");
  const windowDuration = 86400;

  const SpendLimitWallet = await ethers.getContractFactory("SpendLimitWallet");
  const wallet = await SpendLimitWallet.deploy(dailyLimit, windowDuration);
  await wallet.waitForDeployment();

  const address = await wallet.getAddress();
  console.log("\n✅ SpendLimitWallet deployed to:", address);

  // On localhost, auto-fund the contract for testing
  if (!isTestnet) {
    const fundTx = await deployer.sendTransaction({
      to: address,
      value: ethers.parseEther("2.0"),
    });
    await fundTx.wait();
    console.log("Funded contract with 2 ETH (localhost only)");
  }

  // Read ABI from Hardhat compilation artifacts
  const artifactPath = path.join(
    __dirname,
    "../artifacts/contracts/SpendLimitWallet.sol/SpendLimitWallet.json"
  );
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

  // Save deployment info + ABI for the frontend
  const deploymentInfo = {
    address,
    chainId: Number(chainId),
    network: network.name,
    deployer: deployer.address,
    dailyLimitEth: "1.0",
    windowDurationSeconds: windowDuration,
    deployedAt: new Date().toISOString(),
    abi: artifact.abi,
  };

  const outputDir = path.join(
    __dirname,
    "../../../artifacts/spend-limit-wallet/src/lib"
  );
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, "deployment.json");
  fs.writeFileSync(outputPath, JSON.stringify(deploymentInfo, null, 2));
  console.log("Deployment info saved to:", outputPath);

  if (isTestnet) {
    console.log("\n📋 Next steps:");
    console.log("   1. Copy the contract address above");
    console.log("   2. Set VITE_WALLET_ADDRESS=<address> or paste it in the dapp");
    console.log("   3. Add Rootstock Testnet to MetaMask:");
    console.log("      Network:  Rootstock Testnet");
    console.log("      RPC URL:  https://public-node.testnet.rsk.co");
    console.log("      Chain ID: 31");
    console.log("      Currency: tRBTC");
    console.log("      Explorer: https://explorer.testnet.rootstock.io");
  } else {
    console.log("\n📋 Next steps:");
    console.log("   Add Hardhat Localhost to MetaMask:");
    console.log("   RPC URL:  http://localhost:8545");
    console.log("   Chain ID: 31337");
    console.log("   Currency: ETH");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
