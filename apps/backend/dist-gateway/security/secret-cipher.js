"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecretCipher = void 0;
const node_crypto_1 = require("node:crypto");
class SecretCipher {
    appSecret;
    constructor(appSecret) {
        this.appSecret = appSecret;
    }
    key() {
        return (0, node_crypto_1.createHash)('sha256').update(this.appSecret).digest();
    }
    encrypt(plaintext) {
        const iv = (0, node_crypto_1.randomBytes)(12);
        const cipher = (0, node_crypto_1.createCipheriv)('aes-256-gcm', this.key(), iv);
        const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
        const tag = cipher.getAuthTag();
        return [iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join('.');
    }
    decrypt(payload) {
        const [ivBase64, tagBase64, dataBase64] = payload.split('.');
        const decipher = (0, node_crypto_1.createDecipheriv)('aes-256-gcm', this.key(), Buffer.from(ivBase64, 'base64'));
        decipher.setAuthTag(Buffer.from(tagBase64, 'base64'));
        return Buffer.concat([decipher.update(Buffer.from(dataBase64, 'base64')), decipher.final()]).toString('utf8');
    }
}
exports.SecretCipher = SecretCipher;
//# sourceMappingURL=secret-cipher.js.map