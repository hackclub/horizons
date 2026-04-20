export interface EventConfig {
	name: string;
	location?: [number, number];
	locationText?: string;
	dates?: string;
	landingBlurb?: string;
	tagline: string;
	headline: string;
	logo: string;
	logoMaxWidth?: string;
	buttonText: string;
	buttonTextMobile: string;
	footerHint: string;
	background?: {
		image?: string | null;
		pattern?: boolean;
		opacity?: number;
		'mix-blend-mode'?: string;
	};
	colors: {
		background: string;
		dark: string;
		text: string;
		primary: string;
		secondary: string;
		tertiary: string;
		cardBg: string;
	};
	progressBar: {
		approved: string;
		completed: string;
		remaining: string;
	};
	eventCard: {
		bgColor: string;
		bgImage?: string | null;
		gradient?: string | null;
		compactGradient?: string | null;
	};
	stripes: string[];
	menu: EventMenuItem[];
}

export interface EventMenuItem {
	title: string;
	subtitle: string;
	action: 'signup' | 'link';
	href?: string;
	icon: string;
}
