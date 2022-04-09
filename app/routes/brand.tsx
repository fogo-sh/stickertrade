import type { LoaderFunction } from "remix";
import { json, useLoaderData } from "remix";
import type { Colors } from "~/utils/tailwind-data";
import { colors } from "~/utils/tailwind-data";

type LoaderData = Colors;

export const loader: LoaderFunction = async () => {
  const data: LoaderData = colors;
  return json(data);
};

export default function Index() {
  const colors = useLoaderData<LoaderData>();

  return (
    <main className="max-w-lg mx-auto">
      <h1 className="text-2xl mb-4">brand</h1>
      <img
        src="/favicon.svg"
        className="w-[10rem] mx-auto mt-2 mb-6"
        alt="stickertrade logo"
      />
      <div className="flex flex-col sm:flex-row items-center sm:items-start justify-center gap-8 sm:gap-4">
        {Object.entries(colors).map(([key, value]) => (
          <div key={key} className="flex gap-2 flex-col">
            {Object.entries(value).map(([variant, color]) => (
              <div key={variant} className="text-center">
                <div
                  style={{ backgroundColor: color }}
                  className="h-[7rem] w-[7rem] p-2 border-2 border-light-500/50 rounded-sm"
                />
                <p className="text-sm mt-2">{`${key}-${variant}`}</p>
                <code>{color}</code>
              </div>
            ))}
          </div>
        ))}
      </div>
    </main>
  );
}
