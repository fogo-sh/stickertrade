import { json, useLoaderData } from "remix";
import type { LoaderFunction } from "remix";
import invariant from "tiny-invariant";

import { getDevLog } from "~/data/dev-logs.server";
import type { DevLog } from "~/data/dev-logs.server";

type LoaderData = DevLog;

export const loader: LoaderFunction = ({ params }) => {
  invariant(params.slug, "expected params.slug");
  const data: LoaderData | null = getDevLog(params.slug);

  if (data === null) {
    throw new Response("Not Found", {
      status: 404,
    });
  }

  return json(data);
};

export default function DevLogSlug() {
  const log = useLoaderData<LoaderData>();

  return (
    <main
      className="max-w-lg mx-auto markdown"
      dangerouslySetInnerHTML={{
        __html: log.html ?? "ERROR: Log without HTML!",
      }}
    />
  );
}
