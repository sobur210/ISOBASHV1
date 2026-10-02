export declare const AUTH_COOKIE_NAME = "isobash_session";
export declare const SESSION_TTL_MS: number;
export type SessionUser = {
    id: number;
    email: string;
    name: string | null;
    role: 'ADMIN' | 'USER';
    mfaEnabled: boolean;
    createdAt: string;
};
export type AuthSession = {
    id: string;
    expiresAt: Date;
    userId: number;
};
