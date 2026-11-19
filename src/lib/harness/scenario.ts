/** Browser-safe fixture scenario helpers. No Node or gateway imports. */
export type FixtureScenario = 'pass' | 'fail' | 'cancel' | 'malformed';

export function scriptedModelId(scenario: FixtureScenario): string {
  return `harness.scripted.${scenario}`;
}

export function scenarioFromModelId(modelId: string): FixtureScenario {
  const value = modelId.startsWith('harness.scripted.') ? modelId.slice('harness.scripted.'.length) : 'pass';
  return value === 'fail' || value === 'cancel' || value === 'malformed' ? value : 'pass';
}
