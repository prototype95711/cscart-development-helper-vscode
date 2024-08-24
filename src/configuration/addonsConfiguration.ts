export const CONFIGURATION_FILE = '.csaddons';

export interface AddonsConfiguration {
	readonly selectedAddons: string[];
	readonly expandedElements: string[];
}

export function addonConfFromObject(object: any) {
	var selectedAddons = [];
	var expandedElements = [];

	if (object?.selectedAddons) {
		selectedAddons = object?.selectedAddons;
	}

	if (object?.expandedElements) {
		expandedElements = object?.expandedElements;
	}

	const addonsConfiguration: AddonsConfiguration = {
		selectedAddons: selectedAddons,
		expandedElements: expandedElements
	};

	return addonsConfiguration;
}
