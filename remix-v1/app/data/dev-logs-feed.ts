import { Feed } from "feed";
import { devLogs } from "./dev-logs.server";

const jack = {
  name: "Jack Harrhy",
  email: "me@jackharrhy.dev",
  link: "https://jackharrhy.dev",
};

const firstDevLog = devLogs.sort(
  ({ date: a }, { date: b }) => b.getTime() - a.getTime()
)[0];

export const feed = new Feed({
  title: "stickertrade.ca - dev logs",
  description: "a collection of development logs regarding stickertrade.ca",
  id: "https://stickertrade.ca/dev-logs",
  link: "https://stickertrade.ca/dev-logs",
  language: "en",
  favicon: "http://stickertrade.ca/favicon.svg",
  updated: firstDevLog.date,
  copyright: `All rights reserved ${new Date().getFullYear()}, Jack Harrhy`,
  feedLinks: {
    rss: "https://stickertrade.ca/dev-logs.rss",
    atom: "https://stickertrade.ca/dev-logs.atom",
    json: "https://stickertrade.ca/dev-logs.json",
  },
  author: jack,
});

devLogs.forEach((devLog) => {
  const url = `https://stickertrade.ca/dev-logs/${devLog.slug}`;

  feed.addItem({
    title: devLog.title,
    id: url,
    link: url,
    author: [jack],
    contributor: [],
    date: devLog.date,
  });
});
