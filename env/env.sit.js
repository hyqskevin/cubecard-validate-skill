/**
 * SIT 环境配置 - 集成测试
 * V21 白名单 env 名：sit / uat / prod / pre / gray
 */
export default {
  env: 'sit',
  apiBase: 'https://api-sit.example.com',
  gateway: 'https://gateway-sit.example.com',
  payHost: 'https://pay-sit.example.com',
  appId: 'sit_app_001',
  appKey: 'sit_app_key_xxxxxxxxxxxxxxxxxxxx',
  signType: 'RSA2',
  timeout: 10000,
  mockData: true,
  grayRatio: 100, // SIT 全量走 mock
  featureFlags: {
    newTradeDetail: true,
    quickPay: false,
  },
};
