"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_PLAN = exports.PLANS = void 0;
exports.planKeyOf = planKeyOf;
exports.planDefinition = planDefinition;
const MB = 1024 * 1024;
exports.PLANS = [
    {
        key: 'FREE',
        name: 'Free',
        summary: 'The default every account starts on. Files and media are capped so one account cannot fill the shared disk.',
        limits: {
            files: 20,
            fileBytes: 50 * MB,
            mediaAssets: 20,
            mediaBytes: 25 * MB,
        },
    },
    {
        key: 'PRO',
        name: 'Pro',
        summary: 'Raises the per-account storage caps to whatever this deployment is configured to allow. It does not add features, and it does not buy provider credit: providers bill one shared pool.',
        limits: {
            files: null,
            fileBytes: null,
            mediaAssets: null,
            mediaBytes: null,
        },
    },
];
exports.DEFAULT_PLAN = 'FREE';
function planKeyOf(value) {
    const match = exports.PLANS.find((plan) => plan.key === value);
    return match ? match.key : null;
}
function planDefinition(plan) {
    // The enum and the catalogue are declared together, so an unknown key is a
    // code bug rather than data. Falling back to FREE keeps a broken row from
    // handing somebody an unlimited entitlement.
    return exports.PLANS.find((entry) => entry.key === plan) ?? exports.PLANS[0];
}
//# sourceMappingURL=plans.js.map