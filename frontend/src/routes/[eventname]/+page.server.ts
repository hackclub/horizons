import { error } from '@sveltejs/kit';
import yaml from 'js-yaml';
import type { EventConfig } from '$lib/events/types';
import eventsRaw from '$lib/events/events.yaml?raw';
import { m } from '$lib/paraglide/messages.js';

const events = yaml.load(eventsRaw) as Record<string, EventConfig>;

export function load({ params }) {
	const { eventname } = params;

	const config = events[eventname];
	if (!config) {
		throw error(404, m.faq_event_not_found({ name: eventname }));
	}

	return { config, eventname };
}
