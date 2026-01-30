import { describe, expect, it, beforeAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { nanoid } from "nanoid";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createMockContext(user?: AuthenticatedUser): TrpcContext {
  const ctx: TrpcContext = {
    user: user || null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };

  return ctx;
}

describe("report router", () => {
  let savedReportId: string;
  const testPassword = "test-password-123";
  const testClientName = "Test Client Corp.";

  it("should save a report with password protection", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const reportData = {
      clientName: testClientName,
      totalImpressions: 1000000,
      lowQualityBlocked: 50000,
      suitabilityRate: 95.5,
      lift: 5.2,
      budgetOptimization: 75000,
      createdAt: new Date().toISOString(),
    };

    const result = await caller.report.save({
      clientName: testClientName,
      reportData: JSON.stringify(reportData),
      password: testPassword,
    });

    expect(result.success).toBe(true);
    expect(result.reportId).toBeDefined();
    expect(result.shareUrl).toContain(`/shared/${result.reportId}`);

    savedReportId = result.reportId;
  });

  it("should retrieve a report with correct password", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.report.get({
      reportId: savedReportId,
      password: testPassword,
    });

    expect(result.clientName).toBe(testClientName);
    expect(result.reportData).toBeDefined();
    expect(result.reportData.totalImpressions).toBe(1000000);
    expect(result.createdAt).toBeDefined();
  });

  it("should reject access with incorrect password", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.report.get({
        reportId: savedReportId,
        password: "wrong-password",
      })
    ).rejects.toThrow("パスワードが正しくありません");
  });

  it("should reject access to non-existent report", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.report.get({
        reportId: "non-existent-id",
        password: testPassword,
      })
    ).rejects.toThrow("レポートが見つかりません");
  });

  it("should save report with file attachments", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const reportData = {
      clientName: "File Test Client",
      totalImpressions: 2000000,
      createdAt: new Date().toISOString(),
    };

    // Create mock CSV content
    const mockCSVContent = "category name,vcr,ctr,impressions\nTest Category,75,5,100000";
    const base64Content = Buffer.from(mockCSVContent).toString('base64');

    const result = await caller.report.save({
      clientName: "File Test Client",
      reportData: JSON.stringify(reportData),
      password: testPassword,
      performanceFile: {
        name: "performance.csv",
        content: base64Content,
      },
    });

    expect(result.success).toBe(true);
    expect(result.reportId).toBeDefined();
  });

  it("should list reports for authenticated user", async () => {
    const user: AuthenticatedUser = {
      id: 1,
      openId: "test-user-openid",
      email: "test@example.com",
      name: "Test User",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    };

    const ctx = createMockContext(user);
    const caller = appRouter.createCaller(ctx);

    // Save a report as authenticated user
    await caller.report.save({
      clientName: "Auth User Report",
      reportData: JSON.stringify({ test: true }),
      password: testPassword,
    });

    const reports = await caller.report.list();

    expect(Array.isArray(reports)).toBe(true);
    expect(reports.length).toBeGreaterThan(0);
    expect(reports[0]).toHaveProperty('reportId');
    expect(reports[0]).toHaveProperty('clientName');
    expect(reports[0]).toHaveProperty('createdAt');
  });
});
