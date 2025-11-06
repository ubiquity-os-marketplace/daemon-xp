import type { KnipConfig } from "knip";

const config: KnipConfig = {
  entry: ["src/action.ts", "src/worker.ts", "src/index.ts"],
  project: ["src/", "test/"],
  ignore: ["src/types/config.ts", "**/__mocks__/**", "**/__fixtures__/**"],
  ignoreExportsUsedInFile: true,
  ignoreDependencies: ["ts-node", "supabase", "decimal.js", "ethers", "@octokit/graphql-schema", "msw", "@mswjs/data"],
  eslint: true,
};

export default config;
