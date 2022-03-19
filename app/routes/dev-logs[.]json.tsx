import type { LoaderFunction } from "remix";
import { feed } from "~/data/dev-logs-feed";

export const loader: LoaderFunction = async () => {
  const jsonString = feed.json1();
  return new Response(jsonString);
};
