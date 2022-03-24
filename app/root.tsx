import {
  Link,
  Links,
  LiveReload,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useCatch,
} from "remix";
import type { MetaFunction, LinksFunction } from "remix";

import tailwindStyles from "./tailwind.css";
import React from "react";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: tailwindStyles },
  { rel: "icon", href: "/favicon.svg" },
];

export const meta: MetaFunction = () => {
  return { title: "stickertrade" };
};

function Document({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="bg-dark-500 p-4">
        <div className="mx-8 pb-8">
          <header className="border-b border-light p-2 mb-2 flex justify-between max-w-[36rem] mx-auto">
            <Link to="/" className="flex items-center gap-2">
              <img src="/favicon.svg" alt="stickertrade logo" className="h-4" />
              <h1>stickertrade</h1>
            </Link>
            <div className="flex gap-4">
              <Link to="/roadmap">
                <h1>roadmap</h1>
              </Link>
              <Link to="/dev-logs">
                <h1>dev logs</h1>
              </Link>
            </div>
          </header>
          {children}
        </div>
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
      <div className="px-3 py-2 border rounded-md mt-2 bg-light-500">
        <pre className="text-dark-500 font-semibold">{error.message}</pre>
      </div>
    </Document>
  );
}

export function CatchBoundary() {
  const caught = useCatch();

  return (
    <Document>
      <h1 className="text-primary-500 text-3xl text-center my-6">
        {caught.status} {caught.statusText}
      </h1>
    </Document>
  );
}
