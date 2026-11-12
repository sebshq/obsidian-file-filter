// Keyword queries that additionally match task syntax, on top of literal text
// matching: 'task' and 'todo' also match unchecked tasks (- [ ]), 'done' also
// matches completed tasks (- [x]). Only an exact keyword query activates task
// matching — 'done tasks' is matched literally.

export type TaskKind = 'open' | 'done';

const KEYWORDS: Record<string, TaskKind> = {
	task: 'open',
	todo: 'open',
	done: 'done',
};

// q must already be trimmed and lowercased.
export function taskKind(q: string): TaskKind | null {
	return KEYWORDS[q] ?? null;
}

// A task is a list item (bullet or numbered) followed by a checkbox.
const OPEN_TASK = /^\s*(?:[-*+]|\d+[.)])\s+\[ \](?=\s|$)/;
const DONE_TASK = /^\s*(?:[-*+]|\d+[.)])\s+\[x\](?=\s|$)/i;

export function taskLineMatches(lineText: string, kind: TaskKind): boolean {
	return (kind === 'open' ? OPEN_TASK : DONE_TASK).test(lineText);
}

// Whole-file variant, used when scanning embedded files.
export function taskContentMatches(content: string, kind: TaskKind): boolean {
	return content.split('\n').some(line => taskLineMatches(line, kind));
}

// A query is several filters in one: ';' between alternatives (or), '&'
// between terms that must all match (and), a leading '-' on a term to exclude
// it, and "quotes" for literal text. 'gym & -draft; run' keeps lines with gym
// but not draft, and lines with run. A query without them is one plain term.
interface Term { text: string; not: boolean; kind: TaskKind | null }

let parsed: { q: string; groups: Term[][] } = { q: '', groups: [] };

// q must already be trimmed and lowercased.
export function parseQuery(q: string): Term[][] {
	if (parsed.q === q) return parsed.groups;
	const groups: Term[][] = [[]];
	let text = '';
	let quoted = false;
	const endTerm = () => {
		let t = text.trim();
		const not = t.startsWith('-');
		if (not) t = t.slice(1).trim();
		const literal = t.startsWith('"');
		t = t.replace(/^"|"$/g, '');
		if (t) groups[groups.length - 1]!.push({ text: t, not, kind: literal ? null : taskKind(t) });
		text = '';
	};
	for (const ch of q) {
		if (ch === '"') quoted = !quoted;
		if (!quoted && (ch === ';' || ch === '&')) {
			endTerm();
			if (ch === ';') groups.push([]);
		} else text += ch;
	}
	endTerm();
	parsed = { q, groups: groups.filter((g) => g.length) };
	return parsed.groups;
}

// Whether text matches the query. `isTask` says whether the text is a task of
// the given kind, for the task keywords.
export function queryMatches(text: string, q: string, isTask: (kind: TaskKind) => boolean = (kind) => taskContentMatches(text, kind)): boolean {
	const lower = text.toLowerCase();
	const term = (t: Term) => lower.includes(t.text) || (t.kind !== null && isTask(t.kind));
	return parseQuery(q).some((group) => group.every((t) => term(t) !== t.not));
}

// Where the query's terms occur in lowercased text, as [start, end) ranges in order, for highlighting.
export function matchRanges(lower: string, q: string): Array<[number, number]> {
	const ranges: Array<[number, number]> = [];
	for (const group of parseQuery(q)) for (const t of group) {
		if (t.not) continue;
		for (let i = lower.indexOf(t.text); i !== -1; i = lower.indexOf(t.text, i + t.text.length)) ranges.push([i, i + t.text.length]);
	}
	ranges.sort((a, b) => a[0] - b[0]);
	const merged: Array<[number, number]> = [];
	for (const r of ranges) {
		const last = merged[merged.length - 1];
		if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
		else merged.push(r);
	}
	return merged;
}
