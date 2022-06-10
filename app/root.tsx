import {
  Form,
  json,
  Link,
  Links,
  LiveReload,
  LoaderFunction,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useCatch,
  useLoaderData,
} from "remix";
import type { MetaFunction, LinksFunction } from "remix";

import tailwindStyles from "./tailwind.css";
import React from "react";
import { User } from "@prisma/client";
import { getUser } from "./utils/session.server";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: tailwindStyles },
  { rel: "icon", href: "/favicon.svg" },
];

export const meta: MetaFunction = () => {
  return { title: "stickertrade" };
};

type LoaderData = Pick<User, "id" | "username"> | null;

export const loader: LoaderFunction = async ({ request }) => {
  const data: LoaderData = await getUser(request);
  return json(data);
};

function Document({ children }: { children: React.ReactNode }) {
  const user = useLoaderData<LoaderData>();

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
            <Link to="/" className="flex items-center gap-2">
              <img src="/favicon.svg" alt="stickertrade logo" className="h-4" />
              <h1>stickertrade</h1>
            </Link>
            <div className="flex flex-col gap-4">
              {user ? (
                <Form action="/logout" method="post">
                  <button type="submit" className="button-a">
                    <h1>logout</h1>
                  </button>
                </Form>
              ) : (
                <Link to="/login">
                  <h1>login</h1>
                </Link>
              )}
            </div>
          </header>
          <div className="pt-5 pb-8">{children}</div>
        </div>
        <footer className="mb-2 border-t mx-auto max-w-[36rem] border-t-light-500">
          <div className="flex items-center gap-4 p-2 justify-between">
            <Link to="/" className="flex items-center gap-2">
              <img src="/favicon.svg" alt="stickertrade logo" className="h-4" />
              <h1>stickertrade</h1>
            </Link>
            <div className="flex gap-4">
              <Link to="/roadmap">
                <h1>roadmap</h1>
              </Link>
              <Link to="/brand">
                <h1>brand</h1>
              </Link>
              <Link to="/dev-logs">
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
  return (
    <Document>
      <Outlet />
    </Document>
  );
}

export function ErrorBoundary({ error }: { error: Error }) {
  return (
    <Document>
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
    <Document>
      <h1 className="text-primary-500 text-3xl text-center my-2">
        {caught.status} {caught.statusText}
      </h1>
    </Document>
  );
}
