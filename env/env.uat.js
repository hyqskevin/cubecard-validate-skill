/**
 * UAT 环境配置 - 用户验收测试
 */
export default {
  env: 'uat',
  apiBase: 'https://api-uat.example.com',
  gateway: 'https://gateway-uat.example.com',
  payHost: 'https://pay-uat.example.com',
  appId: 'uat_app_001',
  appKey: 'uat_app_key_xxxxxxxxxxxxxxxxxxxx',
  signType: 'RSA2',
  timeout: 8000,
  mockData: false,
  grayRatio: 50, // UAT 50% 灰度
  featureFlags: {
    newTradeDetail: true,
    quickPay: true,
  },
};
