export const config = {
  xenApiUrl: process.env.XEN_API_URL || 'https://api.xen.network',
  x1RpcUrl: process.env.X1_RPC_URL || 'https://rpc.mainnet.x1.xyz',
  rpcBatchSize: 50,
  port: parseInt(process.env.PORT || '3001', 10),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:8080',
  buildVersion: '1.2.0',
  buildDate: '2025-02-08',
} as const;
