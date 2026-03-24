import { createConfig, http } from "wagmi";
import { rootstockTestnet } from "wagmi/chains";
import { injected } from "wagmi/connectors";

export const wagmiConfig = createConfig({
  chains: [rootstockTestnet],
  connectors: [injected()],
  transports: {
    [rootstockTestnet.id]: http("https://public-node.testnet.rsk.co"),
  },
});
