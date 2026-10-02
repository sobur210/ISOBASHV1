export declare function generateTotpSecret(): string;
export declare function base32Decode(input: string): Buffer;
export declare function totpFor(at: number | undefined, secret: string, stepSeconds?: number, digits?: number): string;
export declare function verifyTotp(secret: string, code: string, at?: number, window?: number): boolean;
export declare function otpauthUrl(secret: string, account: string, issuer?: string): string;
