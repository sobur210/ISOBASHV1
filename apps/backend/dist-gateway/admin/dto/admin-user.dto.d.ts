export declare class ListUsersQueryDto {
    /** Free-text match on email or name. */
    q?: string;
    role?: 'ADMIN' | 'USER';
    page?: number;
    pageSize?: number;
}
export declare class UpdateUserRoleDto {
    role: 'ADMIN' | 'USER';
}
