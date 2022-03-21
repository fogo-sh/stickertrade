import path from "path";
import type { LoaderFunction } from "remix";
import { generateImage } from "~/data/og-images";
import invariant from "tiny-invariant";
import { getDevLog } from "~/data/dev-logs.server";
import type { DevLog } from "~/data/dev-logs.server";

const jacksProfilePath = path.join(
  __dirname,
  "..",
  "public",
  "images",
  "dev-logs",
  "jacks-avatar.jpg"
);

type LoaderData = DevLog;

export const loader: LoaderFunction = async ({ params }) => {
  invariant(params.slug, "expected params.slug");
  const data: LoaderData | null = getDevLog(params.slug);

  if (data === null) {
    throw new Response("Not Found", {
      status: 404,
    });
  }

  const socialImage = await generateImage({
    title: data.title,
    bottomInfo: "Jack Harrhy",
    profileImage: jacksProfilePath,
  });
  return new Response(socialImage, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=2419200",
    },
  });
};
