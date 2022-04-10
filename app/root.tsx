import { LoaderFunction, useSubmit } from "remix";
import {
  json,
  Link,
  Links,
  LiveReload,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useCatch,
  useLoaderData,
} from "remix";
import type { MetaFunction, LinksFunction } from "remix";
import { ChevronDownIcon } from "@heroicons/react/solid";
import { Menu } from "@headlessui/react";

import tailwindStyles from "./tailwind.css";
import React from "react";
import type { User } from "@prisma/client";
import { getUser } from "./utils/session.server";
import clsx from "clsx";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: tailwindStyles },
  { rel: "icon", href: "/favicon.svg" },
];

export const meta: MetaFunction = () => {
  return { title: "stickertrade" };
};

type LoaderData = Pick<User, "id" | "username" | "avatarUrl"> | null;
export type RootOutletContext = { user: LoaderData };

export const loader: LoaderFunction = async ({ request }) => {
  const data: LoaderData = await getUser(request);
  return json(data);
};

function Document({
  user = null,
  error = false,
  children,
}: {
  user?: LoaderData;
  error?: boolean;
  children: React.ReactNode;
}) {
  const submit = useSubmit();

  function handleLogoutClick() {
    submit(new FormData(), { action: "/logout", method: "post" });
  }

  // TODO break header and footer into their own components instead of polluting here
  return (
    <html lang="en" className="h-full">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="bg-dark-500 p-4 h-full">
        <div className="mx-auto px-4 min-h-[91.5vh] max-w-7xl">
          <header className="border-b border-light p-2 flex justify-between max-w-[36rem] mx-auto">
            <Link to="/" className="hover:underline flex items-center gap-2">
              <img src="/favicon.svg" alt="stickertrade logo" className="h-4" />
              <h1>stickertrade</h1>
            </Link>
            <div className="flex flex-col gap-4 items-center">
              {!error &&
                (user ? (
                  <div className="flex items-center gap-4">
                    <Menu
                      as="div"
                      className="relative h-0 inline-block text-left"
                    >
                      <Menu.Button className="inline-flex items-center justify-center w-full">
                        <div className="flex items-center gap-3">
                          <img
                            className="w-[1.6em] rounded-full"
                            src={
                              user.avatarUrl ?? "/images/default-avatar.webp"
                            }
                            alt={user.username}
                          />
                          <p>{user.username}</p>
                        </div>
                        <ChevronDownIcon
                          className="w-5 h-5 ml-1 mt-0.5"
                          aria-hidden="true"
                        />
                      </Menu.Button>
                      <Menu.Items className="absolute -mt-1 right-0 origin-top-right bg-light-500 divide-y divide-dark-100 rounded-sm focus:outline-none">
                        <div className="px-1 py-1 ">
                          <Menu.Item>
                            {({ active }) => (
                              <Link to={`/profile/${user.username}`}>
                                <button
                                  className={clsx(
                                    { "bg-primary-400": active },
                                    "text-dark-500 group flex rounded-sm items-center w-full px-2 py-1.5 text-sm"
                                  )}
                                >
                                  profile
                                </button>
                              </Link>
                            )}
                          </Menu.Item>
                        </div>
                        <div className="px-1 py-1 ">
                          <Menu.Item>
                            {({ active }) => (
                              <button
                                type="submit"
                                onClick={handleLogoutClick}
                                className={clsx(
                                  { "bg-primary-400": active },
                                  "text-dark-500 group flex rounded-sm items-center w-full px-2 py-1.5 text-sm"
                                )}
                              >
                                logout
                              </button>
                            )}
                          </Menu.Item>
                        </div>
                      </Menu.Items>
                    </Menu>
                  </div>
                ) : (
                  <Link to="/login" className="hover:underline">
                    <h1>login</h1>
                  </Link>
                ))}
            </div>
          </header>
          <div className="pt-5 pb-8">{children}</div>
        </div>
        <footer className="mb-2 border-t mx-auto max-w-[36rem] border-t-light-500">
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 py-3 sm:py-2 p-2 justify-between">
            <Link to="/" className="hover:underline flex items-center gap-2">
              <img src="/favicon.svg" alt="stickertrade logo" className="h-4" />
              <h1>stickertrade</h1>
            </Link>
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
              <Link to="/roadmap" className="hover:underline">
                <h1>roadmap</h1>
              </Link>
              <Link to="/brand" className="hover:underline">
                <h1>brand</h1>
              </Link>
              <Link to="/dev-logs" className="hover:underline">
                <h1>dev logs</h1>
              </Link>
            </div>
          </div>
        </footer>
        <ScrollRestoration />
        <Scripts />
        <LiveReload />
      </body>
    </html>
  );
}

export default function App() {
  const user = useLoaderData<LoaderData>();

  return (
    <Document user={user}>
      <Outlet context={{ user } as RootOutletContext} />
    </Document>
  );
}

export function ErrorBoundary({ error }: { error: Error }) {
  return (
    <Document error={true}>
      <h1 className="text-primary-500">Oops, something went wrong!</h1>
      <div className="px-3 py-2 border rounded-md  mt-4 bg-light-500">
        <pre className="text-dark-500 font-semibold whitespace-pre-wrap">
          {error.message}
        </pre>
      </div>
    </Document>
  );
}

export function CatchBoundary() {
  const caught = useCatch();

  return (
    <Document error={true}>
      <h1 className="text-primary-500 text-3xl text-center my-2">
        {caught.status} {caught.statusText}
      </h1>
    </Document>
  );
}
