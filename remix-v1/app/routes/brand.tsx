import type { LoaderFunction, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import type { Colors } from "~/utils/tailwind-data";
import { colors } from "~/utils/tailwind-data";

type LoaderData = Colors;

export const meta: MetaFunction = () => {
  return {
    title: `stickertrade - brand`,
  };
};

export const loader: LoaderFunction = async () => {
  const data: LoaderData = colors;
  return json(data);
};

export default function Index() {
  const colors = useLoaderData<LoaderData>();

  return (
    <main className="max-w-2xl mx-auto">
      <h1 className="text-2xl mb-2">brand</h1>
      <h2 className="text-xl mt-3 mb-4">logo</h2>
      <img
        src="/favicon.svg"
        className="w-[10rem] mx-auto mt-2"
        alt="stickertrade logo"
      />
      <h2 className="text-xl mt-6 mb-4">banner</h2>
      <div className="flex items-center justify-center gap-5 border-light-500 border mt-4 py-16">
        <img src="/favicon.svg" alt="stickertrade logo" className="h-16" />
        <p className="text-6xl font-semibold">stickertrade</p>
      </div>
      <h3 className="text-lg opacity-80 italic">as html</h3>
      <img
        src="/images/banner.png"
        alt="stickertrade banner"
        className="border-light-500 border"
      />
      <h3 className="text-lg opacity-80 italic">as png</h3>
      <h2 className="text-xl mt-6 mb-4">colors</h2>
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
