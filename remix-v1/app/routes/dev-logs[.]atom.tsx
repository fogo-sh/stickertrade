import type { LoaderFunction } from "@remix-run/node";
import { feed } from "~/data/dev-logs-feed";

export const loader: LoaderFunction = async () => {
  const atomString = feed.atom1();
  return new Response(atomString);
};
