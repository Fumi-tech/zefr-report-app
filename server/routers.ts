import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure } from "./_core/trpc";
import { createReport, getReportByReportId, getReportsByUserId } from "./db";
import { storagePut } from "./storage";
import { z } from "zod";
import { nanoid } from "nanoid";

// パスワードハッシュ化用のユーティリティ（本番環境ではbcryptなどを使用）
function hashPassword(password: string): string {
  return Buffer.from(password).toString('base64');
}

function verifyPassword(password: string, hash: string): boolean {
  return Buffer.from(password).toString('base64') === hash;
}

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  report: router({
    // レポートを保存
    save: publicProcedure
      .input(z.object({
        clientName: z.string(),
        reportData: z.string(), // JSON stringified report data
        password: z.string(),
        performanceFile: z.object({
          name: z.string(),
          content: z.string(), // base64 encoded
        }).optional(),
        riskFile: z.object({
          name: z.string(),
          content: z.string(),
        }).optional(),
        viewFile: z.object({
          name: z.string(),
          content: z.string(),
        }).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const reportId = nanoid(12);
        const passwordHash = hashPassword(input.password);

        // ファイルをS3にアップロード
        let performanceFileKey: string | undefined;
        let riskFileKey: string | undefined;
        let viewFileKey: string | undefined;

        if (input.performanceFile) {
          const buffer = Buffer.from(input.performanceFile.content, 'base64');
          const key = `reports/${reportId}/performance-${nanoid(8)}.csv`;
          await storagePut(key, buffer, 'text/csv');
          performanceFileKey = key;
        }

        if (input.riskFile) {
          const buffer = Buffer.from(input.riskFile.content, 'base64');
          const key = `reports/${reportId}/risk-${nanoid(8)}.csv`;
          await storagePut(key, buffer, 'text/csv');
          riskFileKey = key;
        }

        if (input.viewFile) {
          const buffer = Buffer.from(input.viewFile.content, 'base64');
          const key = `reports/${reportId}/view-${nanoid(8)}.csv`;
          await storagePut(key, buffer, 'text/csv');
          viewFileKey = key;
        }

        // データベースに保存
        await createReport({
          reportId,
          userId: ctx.user?.id,
          clientName: input.clientName,
          passwordHash,
          reportData: input.reportData,
          performanceFileKey,
          riskFileKey,
          viewFileKey,
        });

        return {
          success: true,
          reportId,
          shareUrl: `/shared/${reportId}`,
        };
      }),

    // レポートを取得（パスワード検証付き）
    get: publicProcedure
      .input(z.object({
        reportId: z.string(),
        password: z.string(),
      }))
      .query(async ({ input }) => {
        const report = await getReportByReportId(input.reportId);

        if (!report) {
          throw new Error('レポートが見つかりません');
        }

        if (!verifyPassword(input.password, report.passwordHash)) {
          throw new Error('パスワードが正しくありません');
        }

        return {
          clientName: report.clientName,
          reportData: JSON.parse(report.reportData),
          createdAt: report.createdAt,
        };
      }),

    // ユーザーのレポート一覧を取得
    list: protectedProcedure.query(async ({ ctx }) => {
      const reports = await getReportsByUserId(ctx.user.id);
      return reports.map(r => ({
        reportId: r.reportId,
        clientName: r.clientName,
        createdAt: r.createdAt,
      }));
    }),
  }),
});

export type AppRouter = typeof appRouter;
