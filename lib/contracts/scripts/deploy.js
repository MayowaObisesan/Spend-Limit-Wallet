const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying SpendLimitWallet...");
  console.log("Deployer:", deployer.address);
  console.log(
    "Balance:",
    ethers.formatEther(await ethers.provider.getBalance(deployer.address)),
    "ETH"
  );

  // 1 ETH daily limit, 24-hour window
  const dailyLimit = ethers.parseEther("1.0");
  const windowDuration = 86400;

  const SpendLimitWallet = await ethers.getContractFactory("SpendLimitWallet");
  const wallet = await SpendLimitWallet.deploy(dailyLimit, windowDuration);
  await wallet.waitForDeployment();

  const address = await wallet.getAddress();
  console.log("SpendLimitWallet deployed to:", address);

  // Fund the wallet with 2 ETH from deployer so it can make spends
  const fundTx = await deployer.sendTransaction({
    to: address,
    value: ethers.parseEther("2.0"),
  });
  await fundTx.wait();
  console.log("Funded contract with 2 ETH");

  // Read ABI from Hardhat compilation artifacts
  const artifactPath = path.join(
    __dirname,
    "../artifacts/contracts/SpendLimitWallet.sol/SpendLimitWallet.json"
  );
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

  // Save deployment info + ABI for the frontend
  const deploymentInfo = {
    address,
    chainId: 31337,
    network: "localhost",
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
  console.log("Deployment info + ABI saved to:", outputPath);

  console.log("\n✅ Done! Add Hardhat localhost to MetaMask:");
  console.log("   Network: Localhost 8545");
  console.log("   RPC URL: http://localhost:8545");
  console.log("   Chain ID: 31337");
  console.log("   Currency: ETH");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
