import { error } from '@sveltejs/kit';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import yaml from 'js-yaml';
import type { EventConfig } from '$lib/events/types';

const eventsPath = resolve('src/lib/events/events.yaml');

export function load({ params }) {
	const { eventname } = params;

	let events: Record<string, EventConfig>;
	try {
		const raw = readFileSync(eventsPath, 'utf-8');
		events = yaml.load(raw) as Record<string, EventConfig>;
	} catch {
		throw error(500, 'Failed to load events config');
	}

	const config = events[eventname];
	if (!config) {
		throw error(404, `Event "${eventname}" not found`);
	}

	return { config, eventname };
}
