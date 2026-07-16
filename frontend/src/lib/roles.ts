/**
 * True if `roles` grants any of the `want` roles. Superadmin is all-encompassing
 * — it satisfies every check — so callers never special-case it. Mirrors the
 * backend `hasRole` helper.
 */
export function hasRole(roles: string[] | undefined, ...want: string[]): boolean {
	if (!roles) return false;
	return roles.includes('superadmin') || want.some((r) => roles.includes(r));
}
