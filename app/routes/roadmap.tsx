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
      title: "User invitations ๐",
      focus: true,
      description: dedent`
        - [x] Planning
        - [x] Invitation page UI
        - [x] Invitation page mocked up
        - [x] Invitation schema planned
        - [x] Invitation schema implemented
        - [x] Test for edge cases
        - [ ] Cleanup UI
        - [ ] Cleanup Implementation
      `,
    },
    {
      title: "Admin Page ๐คด",
      description: dedent`
        - [ ] Methods to delete stickers
        - [ ] Refine table interactions / plumbing
      `,
    },
    {
      title: "Testing ๐งช",
      focus: true,
      description: dedent`
        - [x] vitest setup for backend integration testing
        - [ ] tested invitations
        - [ ] tested login
        - [ ] cypress setup for e2e testing
      `,
    },
    {
      title: "Edit Sticker โ",
      eventually: true,
    },
    {
      title: "Users rough location ๐",
      eventually: true,
    },
    {
      title: "Edit profile page ๐ค",
      eventually: true,
    },
    {
      title: "Social associations ๐โโ๏ธ",
      eventually: true,
      description: dedent`
        - [ ] Discord association (oauth?)
        - [ ] Twitter association (oauth?)
        - [ ] Disassociation
      `,
    },
    {
      title: "Events ๐",
      eventually: true,
    },
    {
      title: "Create Event ๐",
      eventually: true,
    },
    {
      title: "Events Map ๐",
      eventually: true,
    },
    {
      title: "Trading ๐ฑ",
      eventually: true,
    },
    {
      title: "Dedicated sticker page ๐ผ๏ธ",
      eventually: true,
      description: dedent`
        - [ ] Paginated list of stickers
        - [ ] Searching
        - [ ] Filters
      `,
    },
    {
      title: "Opengraph Images ๐ผ๏ธ",
      eventually: true,
    },
    {
      title: "Toasts ๐",
      eventually: true,
    },
    {
      title: "Sticker Image Cropping ๐ผ๏ธ",
      eventually: true,
    },
    {
      title: "Sticker Image Optimization ๐ผ๏ธ",
      eventually: true,
    },
    {
      title: "Accessibility Audit ๐ง",
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
            {task.focus ? "๐ฏ" : ""} {task.title}
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
        ๐ฏ means <span className="text-primary-500">focus</span>
      </p>
      <p className="text-sm">
        smaller <span className="opacity-70">and lesser opacity</span> means{" "}
        <span className="text-secondary-500">eventually</span>
      </p>
    </main>
  );
}
