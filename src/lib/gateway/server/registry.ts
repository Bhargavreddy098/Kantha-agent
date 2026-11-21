import { createHarness, type HarnessComposition } from '../../harness/create';
import { ModelCatalog } from '../providers/model-catalog';
import { GatewayEventFeedService } from '../runs/event-feed';
import { GatewayRunService } from '../runs/session-service';
import { GatewayCapacity, readCapacityLimit } from './capacity';
import { GatewayApprovalService } from './approval-service';
import { GatewayChatService } from './chat-service';
import { GatewayComputerAgentService } from './computer-agent-service';
import { GatewayConnectionStore } from './connection-store';
import { GatewayLifecycleManager } from './lifecycle';
import { GatewaySecretStore, loadGatewaySecretKey } from './secret-store';
import { GatewayDatabase, defaultDatabasePath } from './storage/database';
import { GatewayUsageService } from './usage-service';

export interface GatewayRegistry {
  lifecycle: GatewayLifecycleManager;
  secretStore: GatewaySecretStore;
  connectionStore: GatewayConnectionStore;
  modelCatalog: ModelCatalog;
  chatService: GatewayChatService;
  computerAgent: GatewayComputerAgentService;
  eventFeed: GatewayEventFeedService;
  inferenceCapacity: GatewayCapacity;
  eventCapacity: GatewayCapacity;
  approvalService: GatewayApprovalService;
  usageService: GatewayUsageService;
  runService: GatewayRunService;
  harness: HarnessComposition;
  checkStorage(): boolean;
  close(): void;
}

export function createGatewayRegistry(options: { databasePath?: string; secretKey?: Buffer } = {}): GatewayRegistry {
  const databasePath = options.databasePath ?? process.env.GATEWAY_DB_PATH ?? defaultDatabasePath;
  if (databasePath === ':memory:' && process.env.NODE_ENV === 'production') {
    throw new Error('The production gateway requires a durable SQLite path.');
  }
  const database = new GatewayDatabase(databasePath);
  try {
    const secretStore = new GatewaySecretStore(database, options.secretKey ?? loadGatewaySecretKey(database));
    const connectionStore = new GatewayConnectionStore(database, secretStore);
    const modelCatalog = new ModelCatalog(connectionStore, secretStore);
    const approvalService = new GatewayApprovalService(database);
    const usageService = new GatewayUsageService(database);
    const runService = new GatewayRunService(database, approvalService);
    const eventFeed = new GatewayEventFeedService(database, (session, ctx) => runService.recoverSession(session, ctx));
    const inferenceCapacity = new GatewayCapacity(
      readCapacityLimit('GATEWAY_MAX_ACTIVE_INFERENCE', 32),
      readCapacityLimit('GATEWAY_MAX_WORKSPACE_INFERENCE', 4),
      'rate_limited',
      'Inference',
    );
    const chatService = new GatewayChatService({
      modelCatalog, connectionStore, secretStore, inferenceCapacity, runService, usageService,
    });
    const harness = createHarness(database, runService);
    return {
      lifecycle: gatewayLifecycle,
      secretStore,
      connectionStore,
      modelCatalog,
      chatService,
      computerAgent: new GatewayComputerAgentService({
        db: database, connections: connectionStore, secrets: secretStore, usage: usageService, capacity: inferenceCapacity,
      }),
      eventFeed,
      inferenceCapacity,
      eventCapacity: new GatewayCapacity(
        readCapacityLimit('GATEWAY_MAX_ACTIVE_EVENT_STREAMS', 128),
        readCapacityLimit('GATEWAY_MAX_WORKSPACE_EVENT_STREAMS', 12),
        'subscriber_overflow',
        'Event streaming',
      ),
      approvalService,
      usageService,
      runService,
      harness,
      checkStorage: () => database.check(),
      close: () => {
        harness.service.shutdown();
        runService.shutdown();
        database.close();
      },
    };
  } catch (error) {
    database.close();
    throw error;
  }
}

const globalGateway = globalThis as typeof globalThis & { kanthaGateway?: GatewayRegistry };

export function getGatewayRegistry(): GatewayRegistry {
  return globalGateway.kanthaGateway ??= createGatewayRegistry();
}

// Probe registry initialization as part of readiness so startup failures still return a health response.
export const gatewayLifecycle = new GatewayLifecycleManager(() => getGatewayRegistry().checkStorage());
