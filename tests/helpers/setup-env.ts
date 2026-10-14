import { loadTestEnv } from "./load-test-env";
loadTestEnv();
(process.env as Record<string, string>).NODE_ENV = "test";
