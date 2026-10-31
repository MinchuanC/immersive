// Removes credential values before runtime logs and the log panel retain them.
// Keep the renderer copy in src/utils/consoleLogBuffer.ts aligned; it cannot import Node modules.
const REDACTED = '<redacted>';
const RULES = [
    [/([?&]cookie=)[^&\r\n]*/gi, `$1${REDACTED}`],
    [/((?:^|[^\w])["']?(?:(?:set-)?cookie|authorization|access_token|refresh_token|client_secret)["']?\s*:\s*)("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/gim, `$1"${REDACTED}"`],
    [/(^|[\s{,;])((?:(?:set-)?cookie|authorization):(?!\s*["'])\s*)[^\r\n]*/gim, `$1$2${REDACTED}`],
    [/(\b(?:access_token|refresh_token|client_secret)\s*[:=]\s*)[^&;\s"',}]+/gi, `$1${REDACTED}`],
    [/(\bBearer\s+)[\w.~+\/-]+=*/gi, `$1${REDACTED}`],
];

const redactCredentials = (text) => {
    if (typeof text !== 'string' || !text) return text;
    return RULES.reduce((result, [pattern, replacement]) => result.replace(pattern, replacement), text);
};

module.exports = { REDACTED, redactCredentials };
