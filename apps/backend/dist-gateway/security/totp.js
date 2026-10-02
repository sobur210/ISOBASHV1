"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateTotpSecret = generateTotpSecret;
exports.base32Decode = base32Decode;
exports.totpFor = totpFor;
exports.verifyTotp = verifyTotp;
exports.otpauthUrl = otpauthUrl;
const node_crypto_1 = require("node:crypto");
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;
const DIGITS = 6;
function generateTotpSecret() {
    const bytes = (0, node_crypto_1.randomBytes)(20);
    let bits = 0;
    let value = 0;
    const out = [];
    for (const byte of bytes) {
        value = (value << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            out.push(ALPHABET[(value >>> (bits - 5)) & 31]);
            bits -= 5;
        }
    }
    if (bits > 0)
        out.push(ALPHABET[(value << (5 - bits)) & 31]);
    return out.join('');
}
function base32Decode(input) {
    const clean = input.replace(/=+$/, '').replace(/\s/g, '').toUpperCase();
    if (!/^[A-Z2-7]+$/.test(clean)) {
        throw new Error('Invalid base32 secret.');
    }
    let bits = 0;
    let value = 0;
    const out = [];
    for (const char of clean) {
        value = (value << 5) | ALPHABET.indexOf(char);
        bits += 5;
        if (bits >= 8) {
            out.push((value >>> (bits - 8)) & 0xff);
            bits -= 8;
        }
    }
    return Buffer.from(out);
}
function totpFor(at = Date.now(), secret, stepSeconds = STEP_SECONDS, digits = DIGITS) {
    const counter = Math.floor(at / 1000 / stepSeconds);
    const buffer = Buffer.alloc(8);
    buffer.writeBigUInt64BE(BigInt(counter));
    const digest = (0, node_crypto_1.createHmac)('sha1', base32Decode(secret)).update(buffer).digest();
    const offset = digest[digest.length - 1] & 0x0f;
    const binary = ((digest[offset] & 0x7f) << 24) |
        (digest[offset + 1] << 16) |
        (digest[offset + 2] << 8) |
        digest[offset + 3];
    return (binary % 10 ** digits).toString().padStart(digits, '0');
}
function verifyTotp(secret, code, at = Date.now(), window = 1) {
    for (let skew = -window; skew <= window; skew += 1) {
        if (totpFor(at + skew * 1000 * STEP_SECONDS, secret) === code) {
            return true;
        }
    }
    return false;
}
function otpauthUrl(secret, account, issuer = 'ISOBASH') {
    const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
    return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}
//# sourceMappingURL=totp.js.map