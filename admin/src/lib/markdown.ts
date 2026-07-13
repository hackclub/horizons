import { marked } from 'marked';
import DOMPurify from 'dompurify';

// Parsing + sanitizing large READMEs is CPU-noticeable, and the review flow
// remounts ReadmePanel every time a reviewer switches submissions — often
// back and forth between the same projects. Memoize by content so a repeat
// visit renders instantly.
const MAX_ENTRIES = 30;
const cache = new Map<string, string>();

export function renderMarkdown(markdown: string): string {
	if (!markdown) return '';
	const hit = cache.get(markdown);
	if (hit !== undefined) {
		// Refresh recency so hot entries survive eviction.
		cache.delete(markdown);
		cache.set(markdown, hit);
		return hit;
	}
	const html = DOMPurify.sanitize(marked.parse(markdown) as string);
	cache.set(markdown, html);
	if (cache.size > MAX_ENTRIES) {
		// Map iterates in insertion order — the first key is the least recent.
		cache.delete(cache.keys().next().value as string);
	}
	return html;
}
