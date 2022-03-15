import path from "path";
import fs from "fs/promises";
import parseFrontMatter from "front-matter";
import invariant from "tiny-invariant";
import { marked } from "marked";

export type DevLog = {
  slug: string;
  title: string;
  html?: string;
};

export type DevLogMarkdownAttributes = {
  title: string;
};

const devLogsPath = path.join(__dirname, "..", "dev-logs");

function isValidDevLogAttributes(
  attributes: any
): attributes is DevLogMarkdownAttributes {
  return attributes?.title;
}

export async function getDevLogs(): Promise<DevLog[]> {
  const dir = (await fs.readdir(devLogsPath)).reverse();
  return Promise.all(
    dir.map(async (filename) => {
      const file = await fs.readFile(path.join(devLogsPath, filename));
      const { attributes } = parseFrontMatter(file.toString());
      invariant(
        isValidDevLogAttributes(attributes),
        `${filename} has bad meta data!`
      );
      return {
        slug: filename.replace(/\.md$/, ""),
        title: attributes.title,
      };
    })
  );
}

async function exists(path: string) {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

export async function getDevLog(slug: string): Promise<DevLog | null> {
  const filepath = path.join(devLogsPath, slug + ".md");

  if (!(await exists(filepath))) {
    return null;
  }

  const file = await fs.readFile(filepath);

  const { attributes, body } = parseFrontMatter(file.toString());
  invariant(
    isValidDevLogAttributes(attributes),
    `Post ${filepath} is missing attributes`
  );
  const html = marked(body);
  return { slug, html, title: attributes.title };
}
