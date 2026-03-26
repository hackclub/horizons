import yaml from 'js-yaml';
import shopsYaml from './shops.yaml?raw';

export interface ShopBranding {
	displayName: string;
	tagline: string;
	logo: string;
	cardImage: string | null;
	accentColor: string;
	/** If set, shop renders as disabled/inaccessible */
	tag?: {
		text: string;
		color: string;
	};
}

const parsed = yaml.load(shopsYaml) as Record<string, ShopBranding> | null;

export const shopConfigs: Record<string, ShopBranding> = parsed ?? {};

export function getShopBranding(slug: string): ShopBranding | null {
	return shopConfigs[slug] ?? null;
}
