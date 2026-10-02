import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AppConfig } from './configuration';
import { InjectConfig } from './inject-config';
import { ApiError } from '../errors/api-error';
import { SessionUser } from '../../auth/session.model';

/**
 * Phase 1 feature flags.
 *
 * One vocabulary, read from the environment on both sides of the wire, so a
 * surface can be switched off in one place and be off everywhere. The flags
 * exist to retire surfaces, not to ship unfinished ones: turning a flag off
 * hides the UI, redirects the page and refuses the endpoint, and deletes
 * nothing — code, tables and migrations all stay.
 *
 * Server-side only is the point. A flag checked in the browser is a suggestion;
 * this guard is what actually refuses the route.
 */
export type FeatureName = 'projects' | 'files' | 'codeWorkspace';

export const FEATURE_KEY = 'isobash_feature';

/** Require a feature on a controller or a single handler. */
export const RequireFeature = (feature: FeatureName) => SetMetadata(FEATURE_KEY, feature);

export function featureEnabled(config: AppConfig, feature: FeatureName): boolean {
  return config.features[feature];
}

/**
 * Reads the flag and, when it is off, throws the one structured answer every
 * disabled endpoint returns: 503 with `FEATURE_DISABLED` and the feature name,
 * so a client can tell "switched off" apart from "broken" or "not allowed".
 *
 * Admins pass regardless. A flag hides a surface from the people who use the
 * product; it must not lock the person who has to debug it out of the code
 * that is still running.
 */
@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectConfig() private readonly config: AppConfig,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const feature = this.reflector.getAllAndOverride<FeatureName | undefined>(FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!feature) {
      return true;
    }
    if (featureEnabled(this.config, feature)) {
      return true;
    }
    const request = context.switchToHttp().getRequest<Request & { user?: SessionUser }>();
    if (request.user?.role === 'ADMIN') {
      return true;
    }
    throw new ApiError(
      `${feature} is currently disabled.`,
      503,
      'FEATURE_DISABLED',
      { feature, redirectTo: '/app' },
    );
  }
}