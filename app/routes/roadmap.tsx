import clsx from "clsx";
import { marked } from "marked";
import type { LoaderFunction } from "remix";
import { json, useLoaderData } from "remix";

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
      title: "Login page 👤",
    },
    {
      title: "Login that works ✅️👤",
    },
    {
      title: "Logout 👋👤",
    },
    {
      title: "Create Sticker ➕",
    },
    {
      title: "Edit Sticker ➕",
    },
    {
      title: "Users rough location 📍",
      eventually: true,
    },
    {
      title: "Profile page 👤",
      eventually: true,
    },
    {
      title: "Edit profile page 👤",
      eventually: true,
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
      title: "Opengraph Images 🖼️",
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
