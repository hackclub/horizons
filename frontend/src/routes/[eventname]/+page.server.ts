import { error, redirect } from '@sveltejs/kit';
import yaml from 'js-yaml';
import type { EventConfig } from '$lib/events/types';
import eventsRaw from '$lib/events/events.yaml?raw';

const events = yaml.load(eventsRaw) as Record<string, EventConfig>;

export function load({ params }) {
	const { eventname } = params;

	if (eventname === 'nexus') {
		throw redirect(302, 'https://nexus.hackclub.com');
	}

	const config = events[eventname];
	if (!config) {
		throw error(404, `Event "${eventname}" not found`);
	}

	return { config, eventname };
}
