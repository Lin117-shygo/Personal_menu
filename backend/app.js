require('dotenv').config();
const express = require('express');
const path = require('path');
const https = require('https');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 3000;

// 从环境变量读取，启动前需配置 .env
const API_URL = process.env.LLM_API_URL || 'https://api-slb.openclaudecode.cn/v1/chat/completions';
const API_KEY = process.env.LLM_API_KEY || '';
const MODEL = process.env.LLM_MODEL || 'gpt-5.1';

app.use(express.json());

// 托管前端静态文件
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// API 代理
app.post('/api/chat', (req, res) => {
  const { messages, max_tokens } = req.body;

  if (!API_KEY) {
    return res.status(500).json({ error: 'API key not configured on server' });
  }
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages 字段必填' });
  }

  const payload = JSON.stringify({
    model: MODEL,
    messages,
    max_tokens: max_tokens || 500,
    stream: true,
  });

  const parsed = new URL(API_URL);
  const transport = parsed.protocol === 'https:' ? https : http;

  const options = {
    hostname: parsed.hostname,
    port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
    path: parsed.pathname + parsed.search,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Length': Buffer.byteLength(payload),
    },
  };

  const proxyReq = transport.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, {
      'Content-Type': proxyRes.headers['content-type'] || 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('Proxy error:', err.message);
    if (!res.headersSent) {
      res.status(502).json({ error: '代理请求失败: ' + err.message });
    }
  });

  proxyReq.setTimeout(60000, () => {
    proxyReq.destroy();
    if (!res.headersSent) {
      res.status(504).json({ error: '请求超时' });
    }
  });

  proxyReq.write(payload);
  proxyReq.end();
});

app.listen(PORT, () => {
  console.log(`服务已启动: http://localhost:${PORT}`);
});
