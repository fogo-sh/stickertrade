import type { LoaderFunction } from "remix";
import { json, Link, useLoaderData } from "remix";

import { getDevLogs } from "~/data/dev-logs.server";
import type { DevLog } from "~/data/dev-logs.server";

type LoaderData = DevLog[];

export const loader: LoaderFunction = async () => {
  const data: LoaderData = getDevLogs();
  return json(data);
};

export default function DevLogs() {
  const devLogs = useLoaderData<LoaderData>();

  return (
    <main className="max-w-lg mx-auto">
      <h1 className="text-2xl mb-4">dev logs</h1>
      <div className="markdown">
        <p>a collection of development logs regarding stickertrade.ca</p>
        <p>
          feed available as: <a href="/dev-logs.rss">rss</a> -{" "}
          <a href="/dev-logs.atom">atom</a> - <a href="/dev-logs.json">json</a>
        </p>
        {devLogs.map((devLog) => (
          <Link key={devLog.slug} to={devLog.slug} className="hover:underline">
            <div className="flex justify-between">
              <div>{devLog.title}</div>
              <div>{devLog.dateString}</div>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
