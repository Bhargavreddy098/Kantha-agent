/**
 * Harness public surface. The gateway composes these modules through injected
 * interfaces; repository text, model output and skill content provide context
 * only and never grant authority to dispatch a capability.
 */
export * from './contracts';
export { HarnessJournal, submissionDigest } from './journal';
export { HarnessToolRegistry } from './tools';
export { ScriptedInference, FixtureWorkspace, FixtureVerifier } from './fixture';
export { scriptedModelId, scenarioFromModelId, type FixtureScenario } from './scenario';
export { HarnessRunner } from './runner';
export { GatewayHarnessStore, GatewayHarnessProjection } from './gateway-adapter';
export { HarnessService, parseSubmission, harnessScope } from './service';
export { createHarness } from './create';
