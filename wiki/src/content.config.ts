import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    schema: docsSchema({
      extend: z.object({
        /** 動作を確認したバージョン（例: "2.00"）。現行で使えないものは "old" */
        version: z.string().optional(),
        /** このバージョンから使えなくなった（設定すると old 扱い） */
        brokenIn: z.string().optional(),
        /** 立ち位置（コンボ・起き攻め・セットプレイ） */
        position: z.enum(['center', 'corner']).optional(),
        /** 始動技（例: "2K", "c.S", "6P"） */
        starter: z.string().optional(),
        /** カウンターヒット前提か */
        counterHit: z.boolean().optional(),
        /** ダメージ・難易度（主にコンボ用） */
        damage: z.number().optional(),
        difficulty: z.number().min(1).max(5).optional(),
        /** キャラ対策の相手キャラ */
        opponent: z.string().optional(),
        /** 自由タグ */
        tags: z.array(z.string()).default([]),
        /** コメント欄を出さない（一覧ページなど） */
        comments: z.boolean().default(true),
      }),
    }),
  }),
};
