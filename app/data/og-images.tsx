import type { CanvasRenderingContext2D } from "canvas";
import { createCanvas, loadImage } from "canvas";

// TODO actually type a proper interface to the tailwind config
// @ts-expect-error
import tailwindConfig from "../../tailwind.config";

const colors = tailwindConfig.theme.extend.colors;

// https://camchenry.com/blog/generating-social-images-with-remix

const getLines = (
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
) => {
  const words = text.split(" ");
  const lines = [];
  let currentLine = words[0];

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const width = ctx.measureText(currentLine + " " + word).width;
    if (width < maxWidth) {
      currentLine += " " + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  lines.push(currentLine);
  return lines;
};

type GenerateSocialImage = {
  title: string;
  bottomInfo: string;
  width?: number;
  height?: number;
  fontSize?: number;
  margin?: number;
  profileImage?: string;
  profileRadius?: number;
  font?: string;
};

export const generateImage = async ({
  title,
  bottomInfo,
  width = 1200,
  height = 630,
  fontSize = 80,
  margin = 60,
  profileImage,
  profileRadius = 120,
  font = "Inter",
}: GenerateSocialImage) => {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Draw background gradient
  ctx.fillStyle = colors.dark[500];
  ctx.fillRect(0, 0, width, height);

  // Calculate font sizes and metrics
  ctx.font = `bold ${fontSize}px ${font}`;
  const titleLines = getLines(ctx, title, width - margin * 2);
  const lineHeight = fontSize * 1.2;
  const textHeight = titleLines.length * lineHeight;

  // Draw title text
  titleLines
    .map((line, index) => ({
      text: line,
      x: margin,
      y: (height - textHeight) / 2 + index * lineHeight,
    }))
    .forEach(({ text, x, y }) => {
      ctx.fillStyle = colors.light[500];
      ctx.fillText(text, x, y);
    });

  // Vertical spacing after the title before drawing the bottom
  const spacingAfterTitle = 50;
  // Where to start drawing bottom info
  const bottomOfTitleText = height / 2 + textHeight / 2 + spacingAfterTitle;

  // Draw the bottom info image
  if (profileImage) {
    const img = await loadImage(profileImage);
    const x = margin;
    const y = bottomOfTitleText - profileRadius + lineHeight / 2;
    ctx.drawImage(img, x, y, profileRadius, profileRadius);
  }

  // Draw the bottom info
  const bottomInfoImageXSpacing = 35;
  const bottomInfoImageYSpacing = 12;
  const bottomInfoPosition = {
    x:
      profileImage === undefined
        ? margin
        : margin + profileRadius + bottomInfoImageXSpacing,
    y: bottomOfTitleText + bottomInfoImageYSpacing,
  };
  ctx.font = `${fontSize}px ${font}`;
  ctx.fillText(bottomInfo ?? "???", bottomInfoPosition.x, bottomInfoPosition.y);

  return canvas.toBuffer("image/png");
};
