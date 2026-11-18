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
        /** 自由タグ */
        tags: z.array(z.string()).default([]),
        /** コメント欄を出さない（一覧ページなど） */
        comments: z.boolean().default(true),
      }),
    }),
  }),
};
