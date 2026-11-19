/**
 * Gateway Adapter & Service Contracts
 * Defines server-side service boundaries for storage, secrets, provider adapters, and run services.
 */

import { GatewayConnection, CreateConnectionInput, UpdateConnectionInput, DiscoverModelsResult } from './connection';
import { GatewayModel, ModelListQuery } from './model';
import { AttemptReservation } from './chat';
import { GatewaySession, CreateSessionInput } from './session';
import { GatewayRun, SubmitRunInput, RunSnapshot } from './run';
import { GatewayEvent } from './event';
import { GatewayApproval, ResolveApprovalInput } from './approval';
import { GatewayUsageSummary, AttemptAccounting } from './usage';
import { RequestContext } from './context';

export interface ISecretStore {
  getSecret(ref: string, ctx: RequestContext): Promise<string | null>;
  setSecret(ref: string, value: string, ctx: RequestContext): Promise<void>;
  deleteSecret(ref: string, ctx: RequestContext): Promise<boolean>;
}

export interface IConnectionStore {
  listConnections(ctx: RequestContext): Promise<GatewayConnection[]>;
  getConnection(id: string, ctx: RequestContext): Promise<GatewayConnection | null>;
  createConnection(input: CreateConnectionInput, ctx: RequestContext): Promise<GatewayConnection>;
  updateConnection(id: string, input: UpdateConnectionInput, ctx: RequestContext): Promise<GatewayConnection>;
  deleteConnection(id: string, ctx: RequestContext): Promise<boolean>;
}

export interface IModelCatalog {
  listModels(query: ModelListQuery, ctx: RequestContext): Promise<GatewayModel[]>;
  getModel(id: string, ctx: RequestContext, connectionId?: string): Promise<GatewayModel | null>;
  discoverModels(connectionId: string, ctx: RequestContext): Promise<DiscoverModelsResult>;
}

export interface IRunService {
  createSession(input: CreateSessionInput, ctx: RequestContext): Promise<GatewaySession>;
  getSession(id: string, ctx: RequestContext): Promise<GatewaySession | null>;
  submitRun(input: SubmitRunInput, ctx: RequestContext): Promise<GatewayRun>;
  getRun(id: string, ctx: RequestContext): Promise<GatewayRun | null>;
  getSnapshot(sessionId: string, ctx: RequestContext): Promise<RunSnapshot>;
  cancelRun(runId: string, reason: string | undefined, ctx: RequestContext): Promise<GatewayRun>;
}

export interface IEventFeedService {
  subscribe(sessionId: string, cursor: number, ctx: RequestContext, signal?: AbortSignal): AsyncIterable<GatewayEvent>;
}

export interface IApprovalService {
  getPendingApproval(runId: string, ctx: RequestContext): Promise<GatewayApproval | null>;
  resolveApproval(approvalId: string, input: ResolveApprovalInput, ctx: RequestContext): Promise<GatewayApproval>;
}

export interface IUsageService {
  reserveAttempt(reservation: Omit<AttemptReservation, 'createdAt'>, ctx: RequestContext): Promise<boolean>;
  settleAttempt(accounting: AttemptAccounting, ctx: RequestContext): Promise<void>;
  getUsage(ctx: RequestContext): Promise<GatewayUsageSummary>;
}
