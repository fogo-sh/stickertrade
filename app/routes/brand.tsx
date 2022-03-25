import type { LoaderFunction } from "remix";
import { json, useLoaderData } from "remix";

// TODO actually type a proper interface to the tailwind config
// @ts-expect-error
import tailwindConfig from "../../tailwind.config";

type ColorKey = "primary" | "secondary" | "dark" | "light";
type ColorVariant = 500 | 600 | 700;

type Colors = {
  [key in ColorKey]: {
    [key in ColorVariant]?: string;
  };
};

type LoaderData = Colors;

const colors: Colors = tailwindConfig.theme.extend.colors;

export const loader: LoaderFunction = async () => {
  const data: LoaderData = colors;
  return json(data);
};

export default function Index() {
  const colors = useLoaderData<LoaderData>();

  return (
    <main className="max-w-lg mx-auto pt-2">
      <h1 className="text-2xl mt-1 mb-4">brand</h1>
      <img
        src="/favicon.svg"
        className="w-[10rem] mx-auto mt-2 mb-6"
        alt="stickertrade logo"
      />
      <div className="flex justify-center gap-4">
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
