import { SessionUser } from './session.model';
export declare const ROLES_KEY = "roles";
export declare const Roles: (...roles: SessionUser["role"][]) => import("@nestjs/common").CustomDecorator<string>;
