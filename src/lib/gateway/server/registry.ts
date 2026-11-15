import { ModelCatalog } from '../providers/model-catalog';
import { OpenAIInferenceAdapter } from '../providers/openai-adapter';
import { GatewayEventFeedService } from '../runs/event-feed';
import { GatewayRunService } from '../runs/session-service';
import { GatewayApprovalService } from './approval-service';
import { GatewayConnectionStore } from './connection-store';
import { gatewayLifecycle, type GatewayLifecycleManager } from './lifecycle';
import { GatewaySecretStore, loadGatewaySecretKey } from './secret-store';
import { GatewayDatabase, defaultDatabasePath } from './storage/database';
import { GatewayUsageService } from './usage-service';

export interface GatewayRegistry {
  lifecycle: GatewayLifecycleManager;
  secretStore: GatewaySecretStore;
  connectionStore: GatewayConnectionStore;
  modelCatalog: ModelCatalog;
  inferenceAdapter: OpenAIInferenceAdapter;
  eventFeed: GatewayEventFeedService;
  approvalService: GatewayApprovalService;
  usageService: GatewayUsageService;
  runService: GatewayRunService;
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
    const inferenceAdapter = new OpenAIInferenceAdapter();
    const approvalService = new GatewayApprovalService(database);
    const usageService = new GatewayUsageService(database);
    const runService = new GatewayRunService(database, approvalService);
    const eventFeed = new GatewayEventFeedService(database, (session, ctx) => runService.recoverSession(session, ctx));
    return {
      lifecycle: gatewayLifecycle,
      secretStore,
      connectionStore,
      modelCatalog,
      inferenceAdapter,
      eventFeed,
      approvalService,
      usageService,
      runService,
      checkStorage: () => database.check(),
      close: () => {
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
