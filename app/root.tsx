import React from "react";
import type { LinksFunction, LoaderFunction, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";

import {
  Links,
  LiveReload,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useCatch,
  useLoaderData,
} from "@remix-run/react";

import type { User } from "@prisma/client";

import { getUser } from "~/utils/session.server";
import { Header } from "~/components/Header";
import { Footer } from "~/components/Footer";
import tailwindStyles from "~/tailwind.css";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: tailwindStyles },
  { rel: "icon", href: "/favicon.svg" },
];

export const meta: MetaFunction = () => {
  return { title: "stickertrade" };
};

type LoaderData = Pick<User, "id" | "username" | "role" | "avatarUrl"> | null;
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
  return (
    <html lang="en" className="h-full">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="bg-dark-500 p-4 h-full">
        <div className="mx-auto px-4 min-h-[92.75vh] max-w-7xl">
          <Header user={user} error={error} />
          <div className="flex flex-col items-center">
            <p className="bg-red-500 text-dark-500 text-xl mx-2 mt-8 p-3">
              <b>WARNING:</b>
              <br />
              this site is currently under heavy development
              <br />
              data created here might be reset at <b>any</b> time
              <br />
            </p>
          </div>
          <div className="pt-5 pb-8">{children}</div>
        </div>
        <Footer />
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
