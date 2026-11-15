/**
 * Gateway Fixture Verification Test Suite
 * Validates deterministic round trip of contracts, schemas, and scenarios.
 */

import {
  validateCreateConnectionInput,
  validateUpdateConnectionInput,
  validateGatewayChatRequest,
  validateSubmitRunInput,
  validateResolveApprovalInput,
  validateGatewayEvent,
  isGatewayErrorEnvelope,
} from '../contracts';

import {
  validCreateConnectionPayload,
  validUpdateConnectionPayload,
  validChatRequestPayload,
  validSubmitRunPayload,
  validResolveApprovalPayload,
  validGatewayEventPayload,
  invalidConnectionMissingLabel,
  invalidConnectionBadEndpoint,
  invalidConnectionBadProvider,
  invalidChatEmptyMessages,
  invalidChatBadMessageRole,
  invalidSubmitRunMissingSessionId,
  invalidSubmitRunMissingKey,
  invalidApprovalBadDecision,
  invalidApprovalBadVersion,
  invalidEventBadSequence,
} from './payloads';

import {
  idleScenario,
  runningScenario,
  errorScenario,
  reconnectScenario,
  approvalScenario,
} from './scenarios';

import {
  SEED_WORKSPACE_ID,
  SEED_SESSION_ID,
  SEED_RUN_ID,
  SEED_APPROVAL_ID,
  SEED_SUBMISSION_KEY,
} from './seed-data';

export function runFixtureVerification(): { passed: boolean; testCount: number; errors: string[] } {
  const errors: string[] = [];
  let testCount = 0;

  function assert(condition: boolean, msg: string) {
    testCount++;
    if (!condition) {
      errors.push(`Assertion failed [test ${testCount}]: ${msg}`);
    }
  }

  // 1. Valid Payloads Round Trip
  const vConn = validateCreateConnectionInput(validCreateConnectionPayload);
  assert(vConn.ok === true, 'validCreateConnectionPayload should be valid');
  if (vConn.ok) {
    assert(vConn.data.label === 'DeepSeek Production', 'label should match');
    assert(vConn.data.providerType === 'deepseek', 'providerType should match');
  }

  const vUpdate = validateUpdateConnectionInput(validUpdateConnectionPayload);
  assert(vUpdate.ok === true, 'validUpdateConnectionPayload should be valid');

  const vChat = validateGatewayChatRequest(validChatRequestPayload);
  assert(vChat.ok === true, 'validChatRequestPayload should be valid');
  if (vChat.ok) {
    assert(vChat.data.messages.length === 1, 'chat messages length should be 1');
    assert(vChat.data.messages[0].role === 'user', 'role should be user');
  }

  const vRun = validateSubmitRunInput(validSubmitRunPayload);
  assert(vRun.ok === true, 'validSubmitRunPayload should be valid');
  if (vRun.ok) {
    assert(vRun.data.sessionId === SEED_SESSION_ID, 'sessionId should match');
    assert(vRun.data.submissionKey === 'subm_new_test_key_002', 'submissionKey should match');
  }

  const vAppr = validateResolveApprovalInput(validResolveApprovalPayload);
  assert(vAppr.ok === true, 'validResolveApprovalPayload should be valid');
  if (vAppr.ok) {
    assert(vAppr.data.decision === 'approve', 'decision should match');
    assert(vAppr.data.actionVersion === 1, 'actionVersion should match');
  }

  const vEvt = validateGatewayEvent(validGatewayEventPayload);
  assert(vEvt.ok === true, 'validGatewayEventPayload should be valid');
  if (vEvt.ok) {
    assert(vEvt.data.sequence === 4, 'sequence should match');
    assert(vEvt.data.type === 'run.delta', 'event type should match');
  }

  // 2. Invalid Payloads Rejection
  const iConnLabel = validateCreateConnectionInput(invalidConnectionMissingLabel);
  assert(iConnLabel.ok === false, 'invalidConnectionMissingLabel should fail');
  if (!iConnLabel.ok) {
    assert(iConnLabel.error.field === invalidConnectionMissingLabel.expectedErrorField, 'error field should match');
  }

  const iConnEnd = validateCreateConnectionInput(invalidConnectionBadEndpoint);
  assert(iConnEnd.ok === false, 'invalidConnectionBadEndpoint should fail');
  if (!iConnEnd.ok) {
    assert(iConnEnd.error.field === invalidConnectionBadEndpoint.expectedErrorField, 'endpoint error field should match');
  }

  const iConnProv = validateCreateConnectionInput(invalidConnectionBadProvider);
  assert(iConnProv.ok === false, 'invalidConnectionBadProvider should fail');
  if (!iConnProv.ok) {
    assert(iConnProv.error.field === invalidConnectionBadProvider.expectedErrorField, 'providerType error field should match');
  }

  const iChatEmpty = validateGatewayChatRequest(invalidChatEmptyMessages);
  assert(iChatEmpty.ok === false, 'invalidChatEmptyMessages should fail');
  if (!iChatEmpty.ok) {
    assert(iChatEmpty.error.field === invalidChatEmptyMessages.expectedErrorField, 'messages field should match');
  }

  const iChatRole = validateGatewayChatRequest(invalidChatBadMessageRole);
  assert(iChatRole.ok === false, 'invalidChatBadMessageRole should fail');

  const iRunSession = validateSubmitRunInput(invalidSubmitRunMissingSessionId);
  assert(iRunSession.ok === false, 'invalidSubmitRunMissingSessionId should fail');

  const iRunKey = validateSubmitRunInput(invalidSubmitRunMissingKey);
  assert(iRunKey.ok === false, 'invalidSubmitRunMissingKey should fail');

  const iApprDec = validateResolveApprovalInput(invalidApprovalBadDecision);
  assert(iApprDec.ok === false, 'invalidApprovalBadDecision should fail');

  const iApprVer = validateResolveApprovalInput(invalidApprovalBadVersion);
  assert(iApprVer.ok === false, 'invalidApprovalBadVersion should fail');

  const iEvtSeq = validateGatewayEvent(invalidEventBadSequence);
  assert(iEvtSeq.ok === false, 'invalidEventBadSequence should fail');

  // 3. Scenario Integrity
  // Idle
  assert(idleScenario.status.status === 'ready', 'idle status should be ready');
  assert(idleScenario.activeRun === null, 'idle activeRun should be null');
  assert(idleScenario.pendingApproval === null, 'idle pendingApproval should be null');
  assert(idleScenario.usage.totals.totalTokens === 0, 'idle usage should be 0');

  // Running
  assert(runningScenario.run.status === 'running', 'running scenario run should be running');
  assert(runningScenario.session.activeRunId === SEED_RUN_ID, 'running scenario session activeRunId should match');
  assert(runningScenario.events.length >= 4, 'running scenario should have >= 4 events');
  assert(runningScenario.attemptReservation.status === 'reserved', 'running scenario attempt status should be reserved');

  // Error
  assert(isGatewayErrorEnvelope(errorScenario.rateLimitError), 'rateLimitError should be GatewayErrorEnvelope');
  assert(errorScenario.rateLimitError.retryAfterSeconds === 30, 'rateLimitError retryAfterSeconds should be 30');
  assert(errorScenario.serviceUnavailableError.code === 'service_unavailable', 'serviceUnavailable code match');
  assert(errorScenario.failedRun.status === 'failed', 'failedRun status should be failed');

  // Reconnect
  assert(reconnectScenario.clientCursor === 2, 'clientCursor should be 2');
  assert(reconnectScenario.serverWatermark === 5, 'serverWatermark should be 5');
  assert(reconnectScenario.resyncSignalEvent.type === 'resync.requested', 'resync signal event type should match');
  assert(reconnectScenario.recoverySnapshot.watermark === 5, 'recoverySnapshot watermark should be 5');
  assert(reconnectScenario.recoverySnapshot.messages.length === 3, 'recoverySnapshot should contain 3 messages');

  // Approval
  assert(approvalScenario.run.status === 'waiting_for_approval', 'approval scenario run should be waiting_for_approval');
  assert(approvalScenario.pendingApproval.id === SEED_APPROVAL_ID, 'pendingApproval id should match');
  assert(approvalScenario.pendingApproval.toolName === 'inert_fixture_tool', 'toolName should be inert_fixture_tool');
  assert(approvalScenario.approvedResolution.resolvedApproval.status === 'approved', 'approvedResolution status match');
  assert(approvalScenario.rejectedResolution.resolvedApproval.status === 'rejected', 'rejectedResolution status match');

  // Seed constants
  assert(SEED_WORKSPACE_ID === 'ws_kantha_seed_01', 'workspace id match');
  assert(SEED_SUBMISSION_KEY === 'subm_turn_seed_01', 'submission key match');

  return {
    passed: errors.length === 0,
    testCount,
    errors,
  };
}

