import { Feed } from 'feed'

import { getAllDevLogsWithHtml } from './dev-logs.ts'

const author = {
  name: 'Jack Harrhy',
  email: 'me@jackharrhy.com',
  link: 'https://jackharrhy.com',
}

export function buildDevLogsFeed(origin: string): Feed {
  const logs = getAllDevLogsWithHtml()
  const latest = logs[0]

  const feed = new Feed({
    title: 'stickertrade - dev logs',
    description: 'a collection of dev logs regarding stickertrade',
    id: `${origin}/dev-logs`,
    link: `${origin}/dev-logs`,
    language: 'en',
    favicon: `${origin}/favicon.svg`,
    updated: latest?.date ?? new Date(),
    copyright: `All rights reserved ${new Date().getFullYear()}, Jack Harrhy`,
    feedLinks: {
      rss: `${origin}/dev-logs.rss`,
      atom: `${origin}/dev-logs.atom`,
      json: `${origin}/dev-logs.json`,
    },
    author,
  })

  for (const log of logs) {
    const url = `${origin}/dev-logs/${log.slug}`
    feed.addItem({
      title: log.title,
      id: url,
      link: url,
      author: [author],
      date: log.date,
      content: log.html,
    })
  }

  return feed
}
