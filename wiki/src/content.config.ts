import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';
import { VERSIONS } from './site.config';

const version = z.enum(VERSIONS);

export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    schema: docsSchema({
      extend: z.object({
        /** 使えるバージョン（複数可）。現行が入っていなければ old 扱い。[] なら管理開始時点で使えない */
        versions: z.array(version).optional(),
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
        /** 動画（YouTube / X / mp4 のURL。複数可） */
        videos: z.array(z.union([z.string(), z.object({ url: z.string(), title: z.string().optional() })])).default([]),
        /** コンボパーツ（"2K > 2D > 236K" の形。複数可） */
        combos: z
          .array(
            z.union([
              z.string(),
              z.object({
                route: z.string(),
                damage: z.number().optional(),
                tension: z.number().optional(),
                note: z.string().optional(),
              }),
            ]),
          )
          .default([]),
        /** 紐づける練習方法の記事（"training/xxx" または "xxx"）。コンボ・起き攻め・セットプレイ・キャラ対策・Q&A のみ */
        training: z.array(z.string()).default([]),
        /** 自由タグ */
        tags: z.array(z.string()).default([]),
        /** コメント欄を出さない（一覧ページなど） */
        comments: z.boolean().default(true),
      }),
    }),
  }),
};
