# Kantha Harness Scope

| Feature | Phase | Status |
| --- | --- | --- |
| Baseline and contracts | H0 | planned |
| Durable single-session runner | H1 | planned |
| Gateway inference integration | H2 | planned |
| Context, skills and repository tools | H3 | planned |
| Verification and approval | H4 | planned |
| Release qualification | H5 | planned |

### H0. Baseline and contracts
Intent: Inventory browser routes and gateway interfaces to build a baseline.
Done when: Baseline tests run in a fixture.
- [ ] Map existing routes.
- [ ] Define interfaces.
- [ ] Create fixture.

### H1. Durable single-session runner
Intent: Add session journal and checkpoint for runner stability.
Done when: Runs continue after restart.
- [ ] Journal implementation.
- [ ] Checkpoint logic.
- [ ] Restart verification.

### H2. Gateway inference integration
Intent: Connect gateway to selected model for tool usage.
Done when: Tool round trips succeed in staging.
- [ ] Model connection.
- [ ] Tool call handling.
- [ ] Persistent hosting.

### H3. Context, skills and repository tools
Intent: Prepare workspace tools for repository tasks.
Done when: Repository task loads skills and patches correctly.
- [ ] Tooling setup.
- [ ] Skill bundle configuration.
- [ ] Boundary enforcement.

### H4. Verification and approval
Intent: Add checks and approval lifecycle.
Done when: Repairs run on failed checks.
- [ ] Predefined checks.
- [ ] Approval workflow.
- [ ] Repair mechanism.

### H5. Release qualification
Intent: Validate the full end to end path.
Done when: Release evidence recorded in staging.
- [ ] Full path staging run.
- [ ] Observability setup.
- [ ] Clean exit and rollback.

## /scope complete
This plan covers the Kantha harness implementation.
