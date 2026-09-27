import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export class SecretCipher {
  constructor(private readonly appSecret: string) {}

  private key(): Buffer {
    return createHash('sha256').update(this.appSecret).digest();
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join('.');
  }

  decrypt(payload: string): string {
    const [ivBase64, tagBase64, dataBase64] = payload.split('.');
    const decipher = createDecipheriv('aes-256-gcm', this.key(), Buffer.from(ivBase64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagBase64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(dataBase64, 'base64')), decipher.final()]).toString('utf8');
  }
}