import { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppConfig } from './configuration';
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
export declare const FEATURE_KEY = "isobash_feature";
/** Require a feature on a controller or a single handler. */
export declare const RequireFeature: (feature: FeatureName) => import("@nestjs/common").CustomDecorator<string>;
export declare function featureEnabled(config: AppConfig, feature: FeatureName): boolean;
/**
 * Reads the flag and, when it is off, throws the one structured answer every
 * disabled endpoint returns: 503 with `FEATURE_DISABLED` and the feature name,
 * so a client can tell "switched off" apart from "broken" or "not allowed".
 *
 * Admins pass regardless. A flag hides a surface from the people who use the
 * product; it must not lock the person who has to debug it out of the code
 * that is still running.
 */
export declare class FeatureGuard implements CanActivate {
    private readonly reflector;
    private readonly config;
    constructor(reflector: Reflector, config: AppConfig);
    canActivate(context: ExecutionContext): boolean;
}
