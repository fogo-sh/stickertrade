import clsx from "clsx";
import type { LoaderFunction } from "remix";
import { json, useLoaderData } from "remix";

type Roadmap = {
  id: number;
  title: string;
  focus?: boolean;
  eventually?: boolean;
};

type LoaderData = Roadmap[];

const tasks: Roadmap[] = [
  {
    title: "Work on social image generator microservice 🖼️",
    focus: true,
  },
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
].map((task, index) => ({ ...task, id: index }));

export const loader: LoaderFunction = async () => {
  const data: LoaderData = tasks;
  return json(data);
};

export default function Index() {
  const tasks = useLoaderData<LoaderData>();

  return (
    <main className="max-w-lg mx-auto pt-2">
      <h1 className="text-2xl mt-1 mb-4">roadmap</h1>
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
          </li>
        ))}
      </ul>
      <p className="mt-2.5 text-sm">
        🎯 means <span className="text-primary-500">focus</span>
      </p>
      <p className="text-sm">
        smaller means <span className="text-secondary-500">eventually</span>
      </p>
    </main>
  );
}
