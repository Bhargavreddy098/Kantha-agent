import type { GatewayRunService } from '../gateway/runs/session-service';
import type { GatewayDatabase } from '../gateway/server/storage/database';
import type { IHarnessInference } from './contracts';
import { GatewayHarnessProjection, GatewayHarnessStore } from './gateway-adapter';
import { FixtureVerifier, FixtureWorkspace, ScriptedInference } from './fixture';
import { HarnessJournal } from './journal';
import { HarnessRunner } from './runner';
import { HarnessService } from './service';
import { HarnessToolRegistry } from './tools';

export interface HarnessComposition {
  store: GatewayHarnessStore;
  journal: HarnessJournal;
  tools: HarnessToolRegistry;
  workspace: FixtureWorkspace;
  verifier: FixtureVerifier;
  inference: IHarnessInference;
  projection: GatewayHarnessProjection;
  runner: HarnessRunner;
  service: HarnessService;
}

/**
 * `inference` defaults to the scripted H0/H1 fixture. A qualified H2 provider
 * can be injected here without changing the journal or projection contracts.
 */
export function createHarness(
  db: GatewayDatabase,
  runs: GatewayRunService,
  inference: IHarnessInference = new ScriptedInference(),
): HarnessComposition {
  const store = new GatewayHarnessStore(db);
  const journal = new HarnessJournal(store);
  const tools = new HarnessToolRegistry();
  const workspace = new FixtureWorkspace(store);
  const verifier = new FixtureVerifier(workspace);
  const projection = new GatewayHarnessProjection(db, runs);
  const runner = new HarnessRunner({ journal, inference, tools, workspace, verifier, projection });
  const service = new HarnessService({ store, journal, projection, runner, runs });
  return { store, journal, tools, workspace, verifier, inference, projection, runner, service };
}
