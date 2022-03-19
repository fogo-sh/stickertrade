import type { LoaderFunction } from "remix";
import { feed } from "~/data/dev-logs-feed";

export const loader: LoaderFunction = async () => {
  const rssString = feed.rss2();
  return new Response(rssString);
};
