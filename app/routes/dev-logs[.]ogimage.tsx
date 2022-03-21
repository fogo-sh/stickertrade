import type { LoaderFunction } from "remix";
import { generateImage } from "~/data/og-images";

export const loader: LoaderFunction = async () => {
  const socialImage = await generateImage({
    title: "dev logs",
    bottomInfo: "stickertrade",
  });
  return new Response(socialImage, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=2419200",
    },
  });
};
