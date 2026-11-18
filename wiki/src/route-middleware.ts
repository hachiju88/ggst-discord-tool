import { defineRouteMiddleware } from '@astrojs/starlight/route-data';
import { getCollection } from 'astro:content';
import { isOld } from './site.config';

type Entry = { type: 'link' | 'group'; href?: string; entries?: Entry[]; badge?: unknown };

let oldHrefs: Set<string> | undefined;

/** サイドバーで old 記事に「old」バッジを付ける */
export const onRequest = defineRouteMiddleware(async (context) => {
  if (!oldHrefs) {
    const docs = await getCollection('docs');
    oldHrefs = new Set(docs.filter((d) => isOld(d.data)).map((d) => `/${d.id}/`));
  }
  const walk = (entries: Entry[]) => {
    for (const e of entries) {
      if (e.type === 'group' && e.entries) walk(e.entries);
      else if (e.href && oldHrefs!.has(e.href)) e.badge = { text: 'old', variant: 'caution' };
    }
  };
  walk(context.locals.starlightRoute.sidebar as Entry[]);
});
