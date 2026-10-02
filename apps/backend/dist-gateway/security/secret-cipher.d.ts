export declare class SecretCipher {
    private readonly appSecret;
    constructor(appSecret: string);
    private key;
    encrypt(plaintext: string): string;
    decrypt(payload: string): string;
}
