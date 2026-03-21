/** Format a date string as a relative time (e.g. "2d ago", "1mo ago") */
export function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(months / 12);
  return `${years}y ago`;
}

/** Format a date string as a full readable date */
export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Extract owner/repo from a GitHub URL.
 * Returns null if the URL isn't a valid GitHub repo link.
 */
export function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) return null;
  return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
}

/** Escape HTML special characters to prevent XSS from raw README content */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Parse markdown into HTML. Handles headings, code blocks, inline code,
 * bold, italic, links, images, lists, horizontal rules, and paragraphs.
 * Not a full CommonMark parser, but sufficient for typical READMEs.
 */
export function parseMarkdown(md: string): string {
  const lines = md.split('\n');
  const outputLines: string[] = [];
  let inCodeBlock = false;
  let codeBlockContent: string[] = [];
  let inList: 'ul' | 'ol' | null = null;

  function closeList() {
    if (inList) {
      outputLines.push(inList === 'ul' ? '</ul>' : '</ol>');
      inList = null;
    }
  }

  /** Apply inline formatting: bold, italic, code, links, images */
  function inlineFormat(text: string): string {
    let result = escapeHtml(text);
    // Images before links so ![alt](url) isn't caught by link regex
    result = result.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%;" />');
    result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    result = result.replace(/`([^`]+)`/g, '<code>$1</code>');
    result = result.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    result = result.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    result = result.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    result = result.replace(/_([^_]+)_/g, '<em>$1</em>');
    return result;
  }

  for (const line of lines) {
    // Fenced code blocks
    if (line.trimStart().startsWith('```')) {
      if (inCodeBlock) {
        outputLines.push(`<pre><code>${escapeHtml(codeBlockContent.join('\n'))}</code></pre>`);
        codeBlockContent = [];
        inCodeBlock = false;
      } else {
        closeList();
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent.push(line);
      continue;
    }

    const trimmed = line.trim();

    // Blank line closes list and adds spacing
    if (trimmed === '') {
      closeList();
      continue;
    }

    // Horizontal rule
    if (/^[-*_]{3,}$/.test(trimmed)) {
      closeList();
      outputLines.push('<hr />');
      continue;
    }

    // Headings
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      closeList();
      const level = headingMatch[1].length;
      outputLines.push(`<h${level}>${inlineFormat(headingMatch[2])}</h${level}>`);
      continue;
    }

    // Unordered list items
    const ulMatch = trimmed.match(/^[-*+]\s+(.*)$/);
    if (ulMatch) {
      if (inList !== 'ul') {
        closeList();
        outputLines.push('<ul>');
        inList = 'ul';
      }
      outputLines.push(`<li>${inlineFormat(ulMatch[1])}</li>`);
      continue;
    }

    // Ordered list items
    const olMatch = trimmed.match(/^\d+[.)]\s+(.*)$/);
    if (olMatch) {
      if (inList !== 'ol') {
        closeList();
        outputLines.push('<ol>');
        inList = 'ol';
      }
      outputLines.push(`<li>${inlineFormat(olMatch[1])}</li>`);
      continue;
    }

    // Regular paragraph line
    closeList();
    outputLines.push(`<p>${inlineFormat(trimmed)}</p>`);
  }

  // Close any open blocks
  if (inCodeBlock) {
    outputLines.push(`<pre><code>${escapeHtml(codeBlockContent.join('\n'))}</code></pre>`);
  }
  closeList();

  return outputLines.join('\n');
}
