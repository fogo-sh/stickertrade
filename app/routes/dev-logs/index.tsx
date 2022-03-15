import { json, Link, useLoaderData } from "remix";

import { getDevLogs } from "../../dev-log";
import type { DevLog } from "../../dev-log";

export const loader = async () => {
  return json(await getDevLogs());
};

export default function DevLogs() {
  const devLogs = useLoaderData<DevLog[]>();

  return (
    <main className="max-w-lg mx-auto markdown">
      <h1>dev logs</h1>
      <ul>
        {devLogs.map((devLog) => (
          <li key={devLog.slug}>
            <Link to={devLog.slug}>{devLog.title}</Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
