export const GOOGLE_MAPS_API_SEARCH_DISABLED = true;
export const AI_COLD_CALLS_DISABLED = true;

export const DISABLED_FEATURE_REASON =
  'Disabled to prevent unintended provider spend. Use the reviewed Nomia workflow instead.';

export function disabledFeatureError(feature: string) {
  return new Error(`${feature} is disabled to prevent unintended provider spend.`);
}
