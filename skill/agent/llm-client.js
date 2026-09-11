/**
 * OpenAI 兼容 LLM 客户端。
 *
 * 支持：
 * - 标准 OpenAI：POST {baseURL}/chat/completions
 * - 其他兼容服务（Ollama / vLLM / 内网代理）：只要按同协议暴露即可
 *
 * 设计：
 * - 不依赖第三方 npm 包（OpenAI SDK 体积 + 内网部署白名单都不方便）
 * - 用 node:https / node:http 自带实现，避免 openai SDK
 * - 通过 abortController 实现 timeoutMs
 */

const http = require('node:http');
const https = require('node:https');
const { URL } = require('node:url');
const { requireAgent } = require('../config/agent-loader');

/**
 * 调用 LLM chat/completions。
 * @param {Array<{role:'system'|'user'|'assistant', content:string}>} messages
 * @param {{model?:string, temperature?:number, maxTokens?:number, timeoutMs?:number}} [opts]
 * @returns {Promise<{content:string, raw:object}>}
 */
async function chat(messages, opts = {}) {
  const cfg = requireAgent();
  const url = new URL(cfg.baseURL.replace(/\/$/, '') + '/chat/completions');
  const lib = url.protocol === 'https:' ? https : http;

  const body = JSON.stringify({
    model: opts.model || cfg.model,
    messages,
    temperature: opts.temperature != null ? opts.temperature : cfg.temperature,
    max_tokens: opts.maxTokens || cfg.maxTokens,
    stream: false,
  });

  const timeoutMs = opts.timeoutMs || cfg.timeoutMs || 60000;

  return new Promise((resolve, reject) => {
    const req = lib.request({
      method: 'POST',
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Authorization': `Bearer ${cfg.apiKey}`,
      },
    }, (res) => {
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { buf += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`LLM HTTP ${res.statusCode}: ${buf.slice(0, 500)}`));
          return;
        }
        let parsed;
        try { parsed = JSON.parse(buf); } catch (e) {
          reject(new Error(`LLM 响应非 JSON: ${buf.slice(0, 200)}`));
          return;
        }
        const choice = parsed.choices && parsed.choices[0];
        const content = choice && choice.message && choice.message.content || '';
        resolve({ content, raw: parsed });
      });
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`LLM 请求超时 (${timeoutMs}ms)`));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * 便捷：单轮 prompt。返回 content 字符串。
 */
async function complete(prompt, opts = {}) {
  const cfg = requireAgent();
  const r = await chat(
    [
      { role: 'system', content: cfg.systemPrompt },
      { role: 'user', content: prompt },
    ],
    opts,
  );
  return r.content;
}

module.exports = { chat, complete };
