import { Link, useSubmit } from "@remix-run/react";
import { ChevronDownIcon } from "@heroicons/react/solid";
import { Menu } from "@headlessui/react";
import clsx from "clsx";

import type { User } from "@prisma/client";
import { USER_ROLE } from "~/types";

export function Header({
  user = null,
  error = false,
}: {
  user?: Pick<User, "username" | "avatarUrl" | "role"> | null;
  error?: boolean;
}) {
  const submit = useSubmit();

  function handleLogoutClick() {
    submit(new FormData(), { action: "/logout", method: "post" });
  }

  return (
    <header className="border-b border-light p-2 flex justify-between max-w-[36rem] mx-auto">
      <Link to="/" className="hover:underline flex items-center gap-2">
        <img src="/favicon.svg" alt="stickertrade logo" className="h-4" />
        <h1>stickertrade</h1>
      </Link>
      <div className="flex flex-col gap-4 items-center">
        {!error &&
          (user ? (
            <div className="flex items-center gap-4">
              <Menu as="div" className="relative h-0 inline-block text-left">
                <Menu.Button className="inline-flex items-center justify-center w-full">
                  <div className="flex items-center gap-3">
                    <img
                      className="w-[1.6em] rounded-full"
                      src={user.avatarUrl ?? "/images/default-avatar.webp"}
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
                  {user.role === USER_ROLE.ADMIN && (
                    <div className="px-1 py-1 ">
                      <Menu.Item>
                        {({ active }) => (
                          <Link to="/admin/users">
                            <button
                              className={clsx(
                                { "bg-primary-400": active },
                                "text-dark-500 group flex rounded-sm items-center w-full px-2 py-1.5 text-sm"
                              )}
                            >
                              admin
                            </button>
                          </Link>
                        )}
                      </Menu.Item>
                    </div>
                  )}
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
  );
}
