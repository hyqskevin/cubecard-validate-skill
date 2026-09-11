/**
 * Agent 配置加载器
 *
 * 配置来源优先级（高 → 低）：
 *   1) 环境变量（ACT_AGENT_*，适合 CI / 内网注入 apiKey）
 *   2) skill/config.yaml 的 agent 段（skill 根目录统一登记）
 *
 * 结构校验说明：
 * - `config.yaml` 统一由 `config/index.js` 的 `readRootYaml()` 读取，
 *   并在读取阶段经过 `config/config.schema.json` 校验。
 * - 本文件只负责：
 *   1) 合并默认值
 *   2) 应用 env 覆盖
 *   3) 在 enabled=true 时做最小必填检查
 */

const { readRootYaml } = require('./index');

let cached = null;

/**
 * 加载 agent 配置（cache 一次）。
 * 优先级：env > skill/config.yaml（agent 段） > 默认值
 * @returns {{
 *   enabled: boolean,
 *   provider: string,
 *   baseURL: string,
 *   apiKey: string,
 *   model: string,
 *   temperature: number,
 *   maxTokens: number,
 *   timeoutMs: number,
 *   systemPrompt: string,
 *   minCases: number,
 *   source: 'yaml' | 'default',
 * }}
 */
function loadAgentConfig() {
  if (cached) return cached;
  const defaults = {
    enabled: false,
    provider: 'openai-compatible',
    baseURL: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o-mini',
    temperature: 0.2,
    maxTokens: 4096,
    timeoutMs: 60000,
    systemPrompt: '',
    minCases: 8,
  };

  let cfg = { ...defaults };
  cfg._source = 'default';

  const yaml = readRootYaml();
  if (yaml.agent && Object.keys(yaml.agent).length) {
    cfg = Object.assign(cfg, yaml.agent);
    cfg._source = 'yaml';
  }

  if (process.env.ACT_AGENT_ENABLED != null) {
    cfg.enabled = process.env.ACT_AGENT_ENABLED === 'true';
  }
  if (process.env.ACT_AGENT_BASE_URL) cfg.baseURL = process.env.ACT_AGENT_BASE_URL;
  if (process.env.ACT_AGENT_API_KEY) cfg.apiKey = process.env.ACT_AGENT_API_KEY;
  if (process.env.ACT_AGENT_MODEL) cfg.model = process.env.ACT_AGENT_MODEL;
  if (process.env.ACT_AGENT_PROVIDER) cfg.provider = process.env.ACT_AGENT_PROVIDER;
  if (process.env.ACT_AGENT_TEMPERATURE) {
    const t = parseFloat(process.env.ACT_AGENT_TEMPERATURE);
    if (Number.isFinite(t)) cfg.temperature = t;
  }
  if (process.env.ACT_AGENT_MIN_CASES) {
    const n = parseInt(process.env.ACT_AGENT_MIN_CASES, 10);
    if (Number.isInteger(n) && n > 0) cfg.minCases = n;
  }

  cfg.minCases = Number.isInteger(cfg.minCases) && cfg.minCases > 0 ? cfg.minCases : defaults.minCases;

  if (cfg.enabled) {
    const missing = [];
    if (!cfg.baseURL) missing.push('baseURL');
    if (!cfg.apiKey) missing.push('apiKey');
    if (!cfg.model) missing.push('model');
    if (missing.length) {
      throw new Error(`agent.enabled=true 但缺少必填: ${missing.join(', ')}（可通过环境变量 ACT_AGENT_* 注入）`);
    }
  }

  cached = Object.freeze(cfg);
  return cached;
}

/**
 * 断言 agent 已启用，未启用抛错（供必须 LLM 的子流程使用）。
 */
function requireAgent() {
  const cfg = loadAgentConfig();
  if (!cfg.enabled) {
    throw new Error('agent 未启用：请把 skill/config.yaml 的 agent.enabled 设为 true 或设 ACT_AGENT_ENABLED=true');
  }
  return cfg;
}

module.exports = {
  loadAgentConfig,
  requireAgent,
};
