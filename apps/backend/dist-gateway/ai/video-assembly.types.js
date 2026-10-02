"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ASSEMBLY_MAX_BODY_BYTES = exports.ASSEMBLY_FREE_MAX_SECONDS = exports.ASSEMBLY_RESOLUTIONS = void 0;
/**
 * Resolutions the free plan allows.
 *
 * The free plan caps output at 1080p, so `full-hd` is the ceiling here and
 * anything larger is refused before submission rather than being answered with a
 * `401` after the user has waited. Paid plans raise this; the allow-list is the
 * single place that has to change.
 */
exports.ASSEMBLY_RESOLUTIONS = ['sd', 'hd', 'full-hd'];
/** Free plan ceiling: 60 seconds for a single movie. */
exports.ASSEMBLY_FREE_MAX_SECONDS = 60;
/** The API refuses a request body over 2 MB; signed media URLs are what fill it. */
exports.ASSEMBLY_MAX_BODY_BYTES = 2 * 1024 * 1024;
//# sourceMappingURL=video-assembly.types.js.map