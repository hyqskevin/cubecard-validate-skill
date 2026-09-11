/**
 * PROD 环境配置 - 生产
 */
export default {
  env: 'prod',
  apiBase: 'https://api.example.com',
  gateway: 'https://gateway.example.com',
  payHost: 'https://pay.example.com',
  appId: 'prod_app_001',
  appKey: 'prod_app_key_xxxxxxxxxxxxxxxxxxxx',
  signType: 'RSA2',
  timeout: 5000,
  mockData: false,
  grayRatio: 0,
  featureFlags: {
    newTradeDetail: false,
    quickPay: true,
  },
};
