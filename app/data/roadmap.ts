import { marked } from 'marked'

import type { RoadmapTask } from '../actions/roadmap-page.tsx'

function md(input: string): string {
  return marked.parse(input.trim(), { async: false }) as string
}

const sourceTasks: Array<Omit<RoadmapTask, 'id'>> = [
  {
    title: 'Admin Page 🤴',
    description: md(`
- [ ] Methods to delete stickers
- [ ] Refine table interactions / plumbing
`),
  },
  {
    title: 'Testing 🧪',
    focus: true,
    description: md(`
- [x] node --test setup for backend integration testing
- [ ] tested invitations
- [ ] tested login
`),
  },
  { title: 'Users Search 👤' },
  {
    title: 'Dedicated stickers page 🖼️',
    description: md(`
- [ ] Paginated list of stickers
- [ ] Searching
- [ ] Filters
`),
  },
  { title: 'Friends 👪' },
  { title: 'Edit Sticker ➕', eventually: true },
  { title: 'Users rough location 📍', eventually: true },
  { title: 'Edit profile page 👤', eventually: true },
  {
    title: 'Social associations 🙋‍♂️',
    eventually: true,
    description: md(`
- [ ] Discord association (oauth?)
- [ ] Twitter association (oauth?)
- [ ] Disassociation
`),
  },
  { title: 'Events 📅', eventually: true },
  { title: 'Create Event 📅', eventually: true },
  { title: 'Events Map 📍', eventually: true },
  { title: 'Trading 💱', eventually: true },
  { title: 'Opengraph Images 🖼️', eventually: true },
  { title: 'Toasts 🍞', eventually: true },
  { title: 'Sticker Image Cropping 🖼️', eventually: true },
  {
    title: 'Accessibility Audit 🧐',
    eventually: true,
    description: md(`
- [ ] Color contrast review
- [ ] Screen reader review
`),
  },
]

export const roadmapTasks: RoadmapTask[] = sourceTasks.map((task, id) => ({ ...task, id }))
