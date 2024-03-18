export const CONFIGURATION_FILE = '.csaddons';

export interface AddonsConfiguration {
	readonly selectedAddons: string[];
	readonly expandedElements: string[];
}
