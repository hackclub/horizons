import { Role } from './enums/role.enum';

/**
 * True if `roles` grants any of the `want` roles. Superadmin is all-encompassing
 * — it satisfies every check — so callers never special-case it.
 */
export const hasRole = (roles: string[] | undefined, ...want: Role[]): boolean =>
  !!roles &&
  (roles.includes(Role.Superadmin) || want.some((r) => roles.includes(r)));

/** True if the user holds any elevated (non-plain-user) role. */
export const isElevated = (roles: string[] | undefined): boolean =>
  hasRole(roles, Role.Admin, Role.Reviewer, Role.EventViewer);
