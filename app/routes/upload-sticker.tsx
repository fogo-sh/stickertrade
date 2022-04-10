import type { LoaderFunction } from "remix";
import { json, useLoaderData } from "remix";

type LoaderData = null;

export const loader: LoaderFunction = async () => {
  const data: LoaderData = null;
  return json(data);
};

export default function Index() {
  const data = useLoaderData<LoaderData>();

  return (
    <main className="max-w-lg mx-auto">
      <h1>upload sticker {data}</h1>
    </main>
  );
}
