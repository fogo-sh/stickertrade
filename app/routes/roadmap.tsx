import clsx from "clsx";
import { marked } from "marked";
import type { LoaderFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import dedent from "ts-dedent";

type Roadmap = {
  id: number;
  title: string;
  description?: string;
  focus?: boolean;
  eventually?: boolean;
};

type LoaderData = Roadmap[];

const taskList: Roadmap[] = (
  [
    {
      title: "Admin Page 🤴",
      description: dedent`
        - [ ] Methods to delete stickers
        - [ ] Refine table interactions / plumbing
      `,
    },
    {
      title: "User invitations 👋",
      focus: true,
      description: dedent`
        - [x] Planning
        - [x] Invitation page UI
        - [x] Invitation page mocked up
        - [x] Invitation schema planned
        - [x] Invitation schema implemented
        - [ ] Cleanup UI
        - [ ] Cleanup Implementation
        - [ ] Test for edge cases
      `,
    },
    {
      title: "Testing 🧪",
      focus: true,
      description: dedent`
        - [x] vitest setup for unit testing
        - [ ] cypress setup for integration testing
      `,
    },
    {
      title: "Edit Sticker ➕",
      eventually: true,
    },
    {
      title: "Users rough location 📍",
      eventually: true,
    },
    {
      title: "Edit profile page 👤",
      eventually: true,
    },
    {
      title: "Social associations 🙋‍♂️",
      eventually: true,
      description: dedent`
        - [ ] Discord association (oauth?)
        - [ ] Twitter association (oauth?)
        - [ ] Disassociation
      `,
    },
    {
      title: "Events 📅",
      eventually: true,
    },
    {
      title: "Create Event 📅",
      eventually: true,
    },
    {
      title: "Events Map 📍",
      eventually: true,
    },
    {
      title: "Trading 💱",
      eventually: true,
    },
    {
      title: "Dedicated sticker page 🖼️",
      eventually: true,
      description: dedent`
        - [ ] Paginated list of stickers
        - [ ] Searching
        - [ ] Filters
      `,
    },
    {
      title: "Opengraph Images 🖼️",
      eventually: true,
    },
    {
      title: "Toasts 🍞",
      eventually: true,
    },
    {
      title: "Sticker Image Cropping 🖼️",
      eventually: true,
    },
    {
      title: "Sticker Image Optimization 🖼️",
      eventually: true,
    },
    {
      title: "Accessibility Audit 🧐",
      description: dedent`
        - [ ] Color contrast review
        - [ ] Axe Plugin
        - [ ] Screen reader review
      `,
      eventually: true,
    },
  ] as Roadmap[]
).map((task, index) => ({
  ...task,
  description: task.description ? marked(task.description.trim()) : undefined,
  id: index,
}));

export const loader: LoaderFunction = async () => {
  const data: LoaderData = taskList;
  return json(data);
};

export default function Index() {
  const tasks = useLoaderData<LoaderData>();

  return (
    <main className="max-w-lg mx-auto">
      <h1 className="text-2xl mb-4">roadmap</h1>
      <p className="mt-1 italic text-sm">
        This is my own little todo list of things to get done, eventually this
        might grow into something more complex as more of the site is built.
      </p>
      <ul className="px-3 pt-2 list-disc">
        {tasks.map((task) => (
          <li
            key={task.id}
            className={clsx("my-1", { "opacity-70 text-sm": task.eventually })}
          >
            {task.focus ? "🎯" : ""} {task.title}
            {task.description && (
              <div
                className="px-4 markdown"
                dangerouslySetInnerHTML={{
                  __html: task.description,
                }}
              />
            )}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm">
        🎯 means <span className="text-primary-500">focus</span>
      </p>
      <p className="text-sm">
        smaller <span className="opacity-70">and lesser opacity</span> means{" "}
        <span className="text-secondary-500">eventually</span>
      </p>
    </main>
  );
}
