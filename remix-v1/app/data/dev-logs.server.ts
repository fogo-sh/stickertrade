import path from "path";
import fsSync from "fs";
import parseFrontMatter from "front-matter";
import invariant from "tiny-invariant";
import { marked } from "marked";
import { parse } from "date-fns";

export type DevLog = {
  slug: string;
  title: string;
  date: Date;
  dateString: string;
  html?: string;
};

export type DevLogMarkdownAttributes = {
  title: string;
  date: string;
};

const devLogsPath = path.join(__dirname, "..", "dev-logs");

function isValidDevLogAttributes(
  attributes: any
): attributes is DevLogMarkdownAttributes {
  return attributes?.title && attributes?.date;
}

const dir = fsSync.readdirSync(devLogsPath).reverse();
export const devLogs: DevLog[] = dir.map((filename) => {
  const filepath = path.join(devLogsPath, filename);
  const file = fsSync.readFileSync(filepath);
  const { attributes, body } = parseFrontMatter(file.toString());
  invariant(
    isValidDevLogAttributes(attributes),
    `${filename} has bad meta data!`
  );
  invariant(
    isValidDevLogAttributes(attributes),
    `Post ${filepath} is missing attributes`
  );
  const html = marked(body);

  const date = parse(attributes.date, "yyyy-MM-dd", new Date());

  return {
    slug: filename.replace(/\.md$/, ""),
    title: attributes.title,
    date,
    dateString: attributes.date,
    html,
  };
});

const devLogsWithoutHTML = devLogs.map(({ slug, title, date, dateString }) => ({
  slug,
  title,
  date,
  dateString,
}));

export const getDevLogs = () => devLogsWithoutHTML;

export const getDevLog = (slug: string): DevLog | null => {
  const devlog = devLogs.find((devlog) => devlog.slug === slug);
  return devlog ?? null;
};
