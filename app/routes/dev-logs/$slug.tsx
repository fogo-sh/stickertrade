import { json, useLoaderData } from "remix";
import type { LoaderFunction } from "remix";
import invariant from "tiny-invariant";

import { DevLog, getDevLog } from "../../dev-log";

export const loader: LoaderFunction = async ({ params }) => {
  invariant(params.slug, "expected params.slug");
  return json(await getDevLog(params.slug));
};

export default function DevLogSlug() {
  const log = useLoaderData<DevLog | null>();

  if (!log) {
    // TODO better and more centralized 404 page
    return <h1>404</h1>;
  }

  return (
    <main
      className="max-w-lg mx-auto markdown"
      dangerouslySetInnerHTML={{
        __html: log.html ?? "ERROR: Log without HTML!",
      }}
    />
  );
}
