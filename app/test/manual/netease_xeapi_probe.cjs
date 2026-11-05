#!/usr/bin/env node
const dns = require('dns');
const https = require('https');
const net = require('net');
const crypto = require('crypto');
const encrypt = require('../../node_modules/@neteasecloudmusicapienhanced/api/util/crypto');

// 当前文件用于诊断网易云 xeapi key 接口在不同网络路径下的响应差异。

const DEFAULT_HOST = 'interface.music.163.com';
const COMPARE_HOST = 'interface3.music.163.com';
const XEAPI_KEY_PATH = '/api/gorilla/anti/crawler/security/key/get';
const NETEASE_USER_AGENT =
  'NeteaseMusic/9.1.65.240927161425(9001065);Dalvik/2.1.0 (Linux; U; Android 14; 23013RK75C Build/UKQ1.230804.001)';

function parseArgs(argv) {
  const options = {
    host: DEFAULT_HOST,
    repeat: 1,
    timeoutMs: 8000,
    maxIps: 8,
  };

  for (const arg of argv) {
    const [key, value] = arg.split('=');
    if (key === '--host' && value) options.host = value.trim();
    if (key === '--repeat' && value) options.repeat = Math.max(1, Number(value) || 1);
    if (key === '--timeout' && value) options.timeoutMs = Math.max(1000, Number(value) || 8000);
    if (key === '--max-ips' && value) options.maxIps = Math.max(1, Number(value) || 8);
  }

  return options;
}

function pinnedLookup(ip) {
  const family = net.isIP(ip);
  return (_hostname, lookupOptions, callback) => {
    const done = typeof lookupOptions === 'function' ? lookupOptions : callback;
    const options = typeof lookupOptions === 'function' ? {} : lookupOptions || {};
    if (options.all) {
      done(null, [{ address: ip, family }]);
      return;
    }
    done(null, ip, family);
  };
}

// fetch 的全局连接池会复用上一跳的 TCP，钉 IP 就会连到错误的地址。
// 这里每次单独直连（原来的 httpsAgent、proxy: false），钉 IP 时 lookup 只返回那个地址，SNI 仍是主机名。
function createDirectDispatcher({ lookup, signal, timeoutMs }) {
  return {
    dispatch(opts, handler) {
      const origin = new URL(opts.origin);
      let settled = false;
      const req = https.request({
        protocol: origin.protocol,
        hostname: origin.hostname,
        port: origin.port || 443,
        method: opts.method,
        path: opts.path,
        headers: opts.headers,
        servername: net.isIP(origin.hostname) ? undefined : origin.hostname,
        agent: false,
        ...(lookup ? { lookup } : {}),
      });

      const fail = (error) => {
        if (settled) return;
        settled = true;
        try {
          handler.onError(error);
        } catch {
          // fetch 已经因这次失败结束。
        }
        req.destroy();
      };

      const onAbort = () => {
        fail(signal.reason || new Error('The operation was aborted'));
      };

      try {
        handler.onConnect((error) => {
          fail(error || new Error('The operation was aborted'));
        });
      } catch (error) {
        fail(error);
        return true;
      }
      if (settled) return true;

      if (signal) {
        if (signal.aborted) {
          onAbort();
          return true;
        }
        signal.addEventListener('abort', onAbort, { once: true });
      }

      req.setTimeout(timeoutMs, () => {
        const error = new Error('timeout');
        error.code = 'ECONNABORTED';
        fail(error);
      });

      req.on('error', fail);
      req.on('response', (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('error', fail);
        res.on('end', () => {
          if (settled) return;
          const headerList = [];
          for (const [key, value] of Object.entries(res.headers)) {
            const items = Array.isArray(value) ? value : [value];
            for (const item of items) {
              if (item != null) headerList.push(key, String(item));
            }
          }
          try {
            handler.onHeaders(res.statusCode, headerList, () => {}, res.statusMessage || '');
            if (opts.method !== 'HEAD') {
              const body = Buffer.concat(chunks);
              if (body.length) handler.onData(body);
            }
            handler.onComplete([]);
            settled = true;
            if (signal) signal.removeEventListener('abort', onAbort);
            req.setTimeout(0);
          } catch (error) {
            fail(error);
          }
        });
      });

      (async () => {
        try {
          if (opts.body) {
            for await (const chunk of opts.body) req.write(chunk);
          }
          req.end();
        } catch (error) {
          fail(error);
        }
      })();

      return true;
    },
  };
}

function buildXeapiKeyForm(deviceId, currentKeyVersion = '') {
  const nonce = Array.from({ length: 16 }, () => crypto.randomInt(10)).join('');
  const timestamp = String(Date.now());
  return new URLSearchParams({
    appVersion: '9.1.65',
    currentKeyVersion,
    deviceId,
    nonce,
    os: 'android',
    requestType: 'active',
    signature: encrypt.xeapiSign(timestamp, nonce),
    t1: '',
    t2: '',
    timestamp,
    uid: '',
  }).toString();
}

function generateProbeDeviceId() {
  return Array.from({ length: 52 }, () => crypto.randomInt(16).toString(16).toUpperCase()).join('');
}

function summarizeData(data) {
  if (!data || typeof data !== 'object') {
    return typeof data === 'string' ? data.slice(0, 240) : data;
  }

  return {
    code: data.code,
    message: data.message || data.msg,
    hasData: Boolean(data.data),
    hasEncryptedData: Boolean(data.data && data.data.encryptedData),
    hasSignature: Boolean(data.data && data.data.signature),
    keys: Object.keys(data).slice(0, 12),
  };
}

function summarizeError(error) {
  const cause = error.cause || {};
  return {
    name: error.name,
    message: error.message,
    code: error.code || cause.code,
    errno: error.errno || cause.errno,
    syscall: error.syscall || cause.syscall,
    address: error.address || cause.address,
    port: error.port || cause.port,
    status: error.response && error.response.status,
    response: error.response && summarizeData(error.response.data),
    causeCode: cause.code,
    causeMessage: cause.message,
  };
}

async function readResponseBody(response) {
  const text = await response.text();
  if (!text) return text;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function printResult(result) {
  const marker = result.ok ? 'OK  ' : 'FAIL';
  const duration = `${result.durationMs}ms`.padStart(7);
  const route = result.ip ? `${result.host} @ ${result.ip}` : result.host;
  console.log(`[${marker}] ${duration} ${result.label} ${route}`);

  if (result.ok) {
    console.log(`       status=${result.status} data=${JSON.stringify(result.data)}`);
    return;
  }

  console.log(`       error=${JSON.stringify(result.error)}`);
}

async function runCase({ label, host, method, path = '/', data, headers, ip, timeoutMs }) {
  const start = Date.now();

  const signal = AbortSignal.timeout(timeoutMs);

  try {
    const response = await fetch(`https://${host}${path}`, {
      method,
      headers,
      body: data,
      redirect: 'manual',
      signal,
      dispatcher: createDirectDispatcher({
        lookup: ip ? pinnedLookup(ip) : undefined,
        signal,
        timeoutMs,
      }),
    });
    const body = await readResponseBody(response);

    return {
      ok: response.status > 0 && response.status < 500,
      label,
      host,
      ip,
      durationMs: Date.now() - start,
      status: response.status,
      data: summarizeData(body),
    };
  } catch (error) {
    return {
      ok: false,
      label,
      host,
      ip,
      durationMs: Date.now() - start,
      error: summarizeError(error),
    };
  }
}

async function resolveHost(host) {
  try {
    const records = await dns.promises.lookup(host, { all: true });
    return records.map((record) => record.address);
  } catch (error) {
    console.log(`[DNS ] ${host} ${JSON.stringify(summarizeError(error))}`);
    return [];
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const deviceId = generateProbeDeviceId();
  const ips = (await resolveHost(options.host)).slice(0, options.maxIps);
  const compareIps = (await resolveHost(COMPARE_HOST)).slice(0, options.maxIps);

  console.log('Netease xeapi key probe');
  console.log(`time=${new Date().toISOString()}`);
  console.log(`host=${options.host}`);
  console.log(`compareHost=${COMPARE_HOST}`);
  console.log(`timeoutMs=${options.timeoutMs} repeat=${options.repeat} maxIps=${options.maxIps}`);
  console.log(`resolved=${ips.join(', ') || '(none)'}`);
  console.log(`compareResolved=${compareIps.join(', ') || '(none)'}`);
  console.log('');

  const baseHeaders = {
    'User-Agent': NETEASE_USER_AGENT,
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  for (let round = 1; round <= options.repeat; round += 1) {
    if (options.repeat > 1) {
      console.log(`--- round ${round}/${options.repeat} ---`);
    }

    const hostForm = buildXeapiKeyForm(deviceId);
    const cases = [
      {
        label: 'HEAD root',
        host: options.host,
        method: 'HEAD',
        timeoutMs: options.timeoutMs,
      },
      {
        label: 'POST xeapi key with Cookie',
        host: options.host,
        method: 'POST',
        path: XEAPI_KEY_PATH,
        data: hostForm,
        headers: {
          ...baseHeaders,
          Cookie: `deviceId=${encodeURIComponent(deviceId)}`,
        },
        timeoutMs: options.timeoutMs,
      },
      {
        label: 'POST xeapi key without Cookie',
        host: options.host,
        method: 'POST',
        path: XEAPI_KEY_PATH,
        data: buildXeapiKeyForm(''),
        headers: baseHeaders,
        timeoutMs: options.timeoutMs,
      },
      {
        label: 'HEAD compare root',
        host: COMPARE_HOST,
        method: 'HEAD',
        timeoutMs: options.timeoutMs,
      },
    ];

    for (const ip of ips) {
      cases.push({
        label: 'HEAD root pinned IP',
        host: options.host,
        ip,
        method: 'HEAD',
        timeoutMs: options.timeoutMs,
      });
      cases.push({
        label: 'POST xeapi key pinned IP',
        host: options.host,
        ip,
        method: 'POST',
        path: XEAPI_KEY_PATH,
        data: buildXeapiKeyForm(deviceId),
        headers: {
          ...baseHeaders,
          Cookie: `deviceId=${encodeURIComponent(deviceId)}`,
        },
        timeoutMs: options.timeoutMs,
      });
    }

    for (const testCase of cases) {
      printResult(await runCase(testCase));
    }

    console.log('');
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('[fatal]', error);
    process.exit(1);
  });
