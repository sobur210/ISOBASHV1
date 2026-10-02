import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PLANS } from '../plans';

const PLAN_KEYS = PLANS.map((plan) => plan.key);

export class ChangePlanDto {
  @IsIn(PLAN_KEYS)
  plan!: (typeof PLAN_KEYS)[number];

  /** Why the plan was changed. Kept so an entitlement is never unexplained. */
  @IsOptional()
  @IsString()
  @MaxLength(240)
  note?: string;
}