export type HighlightSegment = { text: string; hit: boolean };

// A pasted Joe fraud-review link (joe.fraud.hackclub.com/ysws/<program>/projects/<id>)
// carries the Joe project id in its last path segment.
const JOE_LINK_RE =
	/^(?:https?:\/\/)?joe\.fraud\.hackclub\.com\/ysws\/[^/]+\/projects\/([0-9a-f-]+)\/?$/i;

/**
 * Trim + lowercase a raw search query, resolving a pasted Joe link to its Joe
 * project id so the link matches wherever the id is part of a haystack.
 */
export function normalizeSearchQuery(query: string): string {
	const q = query.trim();
	return (JOE_LINK_RE.exec(q)?.[1] ?? q).toLowerCase();
}

/**
 * Split text into segments around case-insensitive plain-substring matches of
 * `query`, so templates can wrap hits in <mark>. Uses the same matching rule
 * as `matchesScopedQuery` — what's highlighted is always why a row matched.
 */
export function highlightSegments(text: string, query: string): HighlightSegment[] {
	const q = normalizeSearchQuery(query);
	if (!q || !text) return [{ text, hit: false }];
	const lower = text.toLowerCase();
	const segments: HighlightSegment[] = [];
	let pos = 0;
	while (pos < text.length) {
		const idx = lower.indexOf(q, pos);
		if (idx === -1) {
			segments.push({ text: text.slice(pos), hit: false });
			break;
		}
		if (idx > pos) segments.push({ text: text.slice(pos, idx), hit: false });
		segments.push({ text: text.slice(idx, idx + q.length), hit: true });
		pos = idx + q.length;
	}
	return segments.length ? segments : [{ text, hit: false }];
}

/**
 * Field-scoped substring search. `fields` maps a scope key (e.g. 'title',
 * 'slack') to its searchable text; 'all' searches the newline-joined union so
 * a query can't accidentally match across field boundaries.
 */
export function matchesScopedQuery(
	fields: Record<string, string>,
	field: string,
	query: string,
): boolean {
	const q = normalizeSearchQuery(query);
	if (!q) return true;
	const haystack = field === 'all' ? Object.values(fields).join('\n') : (fields[field] ?? '');
	return haystack.toLowerCase().includes(q);
}
