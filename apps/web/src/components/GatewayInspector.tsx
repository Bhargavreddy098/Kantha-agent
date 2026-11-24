import React, { useState, useEffect, useCallback } from "react";
import {
  Badge,
  Banner,
  Button,
  Card,
  CodeBlock,
  Collapsible,
  Divider,
  EmptyState,
  Grid,
  Heading,
  HStack,
  MetadataList,
  MetadataListItem,
  ScrollableArea,
  Text,
  VStack,
} from "@astryxdesign/core";
import { Activity, ChevronDown, ChevronRight, RefreshCw, Shield, Wrench } from "lucide-react";
import {
  harnessService,
  type GatewayHealthResponse,
  type HarnessToolMeta,
} from "../services/harnessService";

export const GatewayInspector: React.FC = () => {
  const [health, setHealth] = useState<GatewayHealthResponse | null>(null);
  const [tools, setTools] = useState<HarnessToolMeta[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedTool, setExpandedTool] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [h, t] = await Promise.all([
        harnessService.getGatewayHealth(),
        harnessService.getToolsCatalog(),
      ]);
      setHealth(h);
      setTools(t.tools || []);
    } catch (err: any) {
      setError(err?.message || "Failed to load gateway & harness diagnostics");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const successRate =
    health && health.totals.requests > 0
      ? `${Math.round((health.totals.successes / health.totals.requests) * 100)}%`
      : "—";

  const categories: Array<{ id: HarnessToolMeta["category"]; label: string }> = [
    { id: "filesystem", label: "FILESYSTEM" },
    { id: "search", label: "SEARCH" },
    { id: "git", label: "GIT" },
    { id: "runtime", label: "RUNTIME" },
  ];

  return (
    <ScrollableArea
      label="Gateway and Tools Inspector"
      style={{
        height: "100%",
        width: "100%",
        backgroundColor: "var(--swiss-bg)",
      }}
    >
      <VStack
        gap="24px"
        style={{
          maxWidth: "1080px",
          margin: "0 auto",
          padding: "28px 32px 64px 32px",
          width: "100%",
        }}
      >
        {/* Swiss Header */}
        <HStack justify="space-between" align="center" style={{ width: "100%" }}>
          <VStack gap="4px">
            <Text
              size="xs"
              weight="semibold"
              style={{
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--swiss-accent)",
              }}
            >
              GATEWAY TELEMETRY &amp; TOOL CATALOG
            </Text>
            <Heading
              level={1}
              style={{ fontSize: "26px", letterSpacing: "-0.025em", margin: 0 }}
            >
              Resilience Inspector &amp; Harness Registry
            </Heading>
          </VStack>

          <Button
            label="Refresh inspector metrics"
            variant="secondary"
            size="sm"
            icon={<RefreshCw size={13} className={isLoading ? "animate-spin" : undefined} />}
            isLoading={isLoading}
            onClick={loadData}
          >
            Refresh
          </Button>
        </HStack>

        {error && (
          <Banner status="error" title="Diagnostics unavailable" description={error} />
        )}

        {/* 4-Column Swiss KPI Grid */}
        <Grid columns={{ minWidth: 200, max: 4 }} gap={12} width="100%">
          <Card
            variant="default"
            padding={16}
            style={{ border: "1px solid var(--swiss-border)", borderRadius: "2px" }}
          >
            <VStack gap="6px">
              <Text
                size="xs"
                style={{
                  fontFamily: "var(--font-mono)",
                  letterSpacing: "0.08em",
                  color: "var(--swiss-text-secondary)",
                }}
              >
                GATEWAY STATUS
              </Text>
              <HStack align="center" gap="8px">
                <Badge
                  label={(health?.status || "healthy").toUpperCase()}
                  variant={health?.status === "degraded" ? "warning" : "success"}
                />
                <Text size="xs" style={{ fontFamily: "var(--font-mono)", color: "var(--swiss-text-secondary)" }}>
                  {health?.defaultModel || "openrouter:openrouter/free"}
                </Text>
              </HStack>
            </VStack>
          </Card>

          <Card
            variant="default"
            padding={16}
            style={{ border: "1px solid var(--swiss-border)", borderRadius: "2px" }}
          >
            <VStack gap="6px">
              <Text
                size="xs"
                style={{
                  fontFamily: "var(--font-mono)",
                  letterSpacing: "0.08em",
                  color: "var(--swiss-text-secondary)",
                }}
              >
                REQUESTS / SUCCESS
              </Text>
              <Text
                size="xl"
                weight="bold"
                hasTabularNumbers
                style={{ fontFamily: "var(--font-mono)" }}
              >
                {health?.totals.requests ?? 0} ({successRate})
              </Text>
            </VStack>
          </Card>

          <Card
            variant="default"
            padding={16}
            style={{ border: "1px solid var(--swiss-border)", borderRadius: "2px" }}
          >
            <VStack gap="6px">
              <Text
                size="xs"
                style={{
                  fontFamily: "var(--font-mono)",
                  letterSpacing: "0.08em",
                  color: "var(--swiss-text-secondary)",
                }}
              >
                RETRIES / FAILOVERS
              </Text>
              <Text
                size="xl"
                weight="bold"
                hasTabularNumbers
                style={{ fontFamily: "var(--font-mono)" }}
              >
                {health?.totals.retries ?? 0} / {health?.totals.fallbacks ?? 0}
              </Text>
            </VStack>
          </Card>

          <Card
            variant="default"
            padding={16}
            style={{ border: "1px solid var(--swiss-border)", borderRadius: "2px" }}
          >
            <VStack gap="6px">
              <Text
                size="xs"
                style={{
                  fontFamily: "var(--font-mono)",
                  letterSpacing: "0.08em",
                  color: "var(--swiss-text-secondary)",
                }}
              >
                LEDGER TOKENS / COST
              </Text>
              <Text
                size="xl"
                weight="bold"
                hasTabularNumbers
                style={{ fontFamily: "var(--font-mono)" }}
              >
                {(
                  (health?.ledger.totalInputTokens ?? 0) +
                  (health?.ledger.totalOutputTokens ?? 0)
                ).toLocaleString()}{" "}
                · ${(health?.ledger.totalCostUsd ?? 0).toFixed(4)}
              </Text>
            </VStack>
          </Card>
        </Grid>

        <Divider />

        {/* Per-Target Circuit Breakers */}
        <VStack gap="12px" style={{ width: "100%" }}>
          <HStack align="center" gap="8px">
            <Activity size={15} style={{ color: "var(--swiss-accent)" }} />
            <Heading level={2} style={{ fontSize: "16px", margin: 0 }}>
              Circuit Breakers &amp; Target Latency
            </Heading>
          </HStack>

          {health && health.providers.length > 0 ? (
            <Grid columns={{ minWidth: 300, max: 2 }} gap={12} width="100%">
              {health.providers.map((p) => (
                <Card
                  key={p.providerId}
                  variant="default"
                  padding={14}
                  style={{ border: "1px solid var(--swiss-border)", borderRadius: "2px" }}
                >
                  <VStack gap="10px">
                    <HStack justify="space-between" align="center" style={{ width: "100%" }}>
                      <Text
                        size="sm"
                        weight="semibold"
                        style={{ fontFamily: "var(--font-mono)" }}
                      >
                        {p.providerId}
                      </Text>
                      <Badge
                        label={p.state.toUpperCase()}
                        variant={
                          p.state === "closed"
                            ? "success"
                            : p.state === "half_open"
                            ? "warning"
                            : "error"
                        }
                      />
                    </HStack>

                    <MetadataList columns={3}>
                      <MetadataListItem label="Requests">
                        <Text size="xs" hasTabularNumbers style={{ fontFamily: "var(--font-mono)" }}>
                          {p.totalRequests}
                        </Text>
                      </MetadataListItem>
                      <MetadataListItem label="Latency EMA">
                        <Text size="xs" hasTabularNumbers style={{ fontFamily: "var(--font-mono)" }}>
                          {p.latencyEmaMs}ms
                        </Text>
                      </MetadataListItem>
                      <MetadataListItem label="Failures">
                        <Text size="xs" hasTabularNumbers style={{ fontFamily: "var(--font-mono)" }}>
                          {p.failedRequests}
                        </Text>
                      </MetadataListItem>
                    </MetadataList>

                    {p.lastError && (
                      <Text
                        size="xs"
                        style={{
                          fontFamily: "var(--font-mono)",
                          color: "var(--swiss-accent)",
                        }}
                      >
                        Last error: {p.lastError.slice(0, 120)}
                      </Text>
                    )}
                  </VStack>
                </Card>
              ))}
            </Grid>
          ) : (
            <Card
              variant="muted"
              padding={16}
              style={{ border: "1px solid var(--swiss-border)", borderRadius: "2px" }}
            >
              <EmptyState
                isCompact
                title="No live inference requests recorded yet"
                description="Send a message in Chat or run a task in Harness to populate per-model circuit breaker and latency telemetry."
              />
            </Card>
          )}
        </VStack>

        <Divider />

        {/* 10 Registered Harness Tools */}
        <VStack gap="16px" style={{ width: "100%" }}>
          <HStack justify="space-between" align="center" style={{ width: "100%" }}>
            <HStack align="center" gap="8px">
              <Wrench size={15} style={{ color: "var(--swiss-accent)" }} />
              <Heading level={2} style={{ fontSize: "16px", margin: 0 }}>
                Harness Tool Suite ({tools.length} Registered)
              </Heading>
            </HStack>
            <HStack align="center" gap="6px">
              <Shield size={13} style={{ color: "var(--swiss-text-secondary)" }} />
              <Text size="xs" style={{ color: "var(--swiss-text-secondary)" }}>
                Workspace-confined · Read tools parallelized · Write/Exec approval-gated
              </Text>
            </HStack>
          </HStack>

          {categories.map((cat) => {
            const items = tools.filter((t) => t.category === cat.id);
            if (items.length === 0) return null;
            return (
              <VStack key={cat.id} gap="8px" style={{ width: "100%" }}>
                <Text
                  size="xs"
                  weight="bold"
                  style={{
                    fontFamily: "var(--font-mono)",
                    letterSpacing: "0.08em",
                    color: "var(--swiss-text-secondary)",
                  }}
                >
                  {cat.label} ({items.length})
                </Text>

                <Grid columns={{ minWidth: 320, max: 2 }} gap={10} width="100%">
                  {items.map((tool) => {
                    const isOpen = expandedTool === tool.name;
                    return (
                      <Card
                        key={tool.name}
                        variant="default"
                        padding={14}
                        style={{ border: "1px solid var(--swiss-border)", borderRadius: "2px" }}
                      >
                        <VStack gap="8px">
                          <HStack justify="space-between" align="center" style={{ width: "100%" }}>
                            <Text
                              size="sm"
                              weight="semibold"
                              style={{ fontFamily: "var(--font-mono)" }}
                            >
                              {tool.name}
                            </Text>
                            <HStack gap="6px">
                              <Badge
                                label={tool.risk.toUpperCase()}
                                variant={
                                  tool.risk === "read"
                                    ? "neutral"
                                    : tool.risk === "write"
                                    ? "warning"
                                    : "error"
                                }
                              />
                              <Badge
                                label={tool.requiresApproval ? "GATED" : "AUTO"}
                                variant={tool.requiresApproval ? "orange" : "success"}
                              />
                            </HStack>
                          </HStack>

                          <Text
                            size="xs"
                            style={{ color: "var(--swiss-text-secondary)", lineHeight: 1.5 }}
                          >
                            {tool.description}
                          </Text>

                          <Collapsible
                            isOpen={isOpen}
                            onOpenChange={(open) => setExpandedTool(open ? tool.name : null)}
                            trigger={
                              <HStack align="center" gap="4px" style={{ cursor: "pointer" }}>
                                {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                <Text
                                  size="xs"
                                  style={{
                                    fontFamily: "var(--font-mono)",
                                    color: "var(--swiss-text-secondary)",
                                  }}
                                >
                                  JSON Schema
                                </Text>
                              </HStack>
                            }
                          >
                            <div style={{ marginTop: "8px" }}>
                              <CodeBlock
                                code={JSON.stringify(tool.parameters, null, 2)}
                                language="json"
                                maxHeight={180}
                              />
                            </div>
                          </Collapsible>
                        </VStack>
                      </Card>
                    );
                  })}
                </Grid>
              </VStack>
            );
          })}
        </VStack>

        {/* Recent Ledger Turns */}
        {health && health.ledger.recentTurns.length > 0 && (
          <>
            <Divider />
            <VStack gap="10px" style={{ width: "100%" }}>
              <Heading level={2} style={{ fontSize: "16px", margin: 0 }}>
                Recent Usage Ledger Turns
              </Heading>
              <VStack gap="6px" style={{ width: "100%" }}>
                {health.ledger.recentTurns.map((turn) => (
                  <Card
                    key={turn.id}
                    variant="default"
                    padding={10}
                    style={{ border: "1px solid var(--swiss-border)", borderRadius: "2px" }}
                  >
                    <HStack justify="space-between" align="center" style={{ width: "100%" }}>
                      <HStack gap="10px" align="center">
                        <Badge
                          label={turn.status.toUpperCase()}
                          variant={turn.status === "completed" ? "success" : "warning"}
                        />
                        <Text size="xs" weight="semibold" style={{ fontFamily: "var(--font-mono)" }}>
                          {turn.providerId}:{turn.modelId}
                        </Text>
                      </HStack>
                      <Text
                        size="xs"
                        hasTabularNumbers
                        style={{
                          fontFamily: "var(--font-mono)",
                          color: "var(--swiss-text-secondary)",
                        }}
                      >
                        {turn.inputTokens} in / {turn.outputTokens} out · ${turn.costUsd.toFixed(4)}
                      </Text>
                    </HStack>
                  </Card>
                ))}
              </VStack>
            </VStack>
          </>
        )}
      </VStack>
    </ScrollableArea>
  );
};
