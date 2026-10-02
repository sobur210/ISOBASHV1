declare const PLAN_KEYS: import(".prisma/client").$Enums.PlanKey[];
export declare class ChangePlanDto {
    plan: (typeof PLAN_KEYS)[number];
    /** Why the plan was changed. Kept so an entitlement is never unexplained. */
    note?: string;
}
export {};
