export interface EventConfig {
	name: string;
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
