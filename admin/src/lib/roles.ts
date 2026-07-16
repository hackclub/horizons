/**
 * True if `roles` grants any of the `want` roles. Superadmin is all-encompassing
 * — it satisfies every check — so callers never special-case it. Mirrors the
 * backend `hasRole` helper.
 */
export function hasRole(roles: string[] | undefined, ...want: string[]): boolean {
	if (!roles) return false;
	return roles.includes('superadmin') || want.some((r) => roles.includes(r));
}

/** The roles that may sign into the admin dashboard at all. */
export const PRIVILEGED_ROLES = ['admin', 'reviewer', 'event_viewer', 'superadmin'];

/** True if the user may access the admin dashboard (holds any elevated role). */
export function isPrivileged(roles: string[] | undefined): boolean {
	return hasRole(roles, 'admin', 'reviewer', 'event_viewer');
}
