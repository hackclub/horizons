export type HighlightSegment = { text: string; hit: boolean };

/**
 * Split text into segments around case-insensitive plain-substring matches of
 * `query`, so templates can wrap hits in <mark>. Uses the same matching rule
 * as `matchesScopedQuery` — what's highlighted is always why a row matched.
 */
export function highlightSegments(text: string, query: string): HighlightSegment[] {
	const q = query.trim().toLowerCase();
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
	const q = query.trim().toLowerCase();
	if (!q) return true;
	const haystack = field === 'all' ? Object.values(fields).join('\n') : (fields[field] ?? '');
	return haystack.toLowerCase().includes(q);
}
