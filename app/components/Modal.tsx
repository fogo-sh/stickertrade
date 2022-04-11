import { Dialog, Transition } from "@headlessui/react";
import { Fragment } from "react";

export function Modal({
  isOpen,
  setIsOpen,
}: {
  isOpen: boolean;
  setIsOpen: Function;
}) {
  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog
        as="div"
        className="fixed inset-0 z-10 overflow-y-auto bg-dark-500 bg-opacity-50"
        onClose={() => setIsOpen(false)}
      >
        <div className="min-h-screen px-4 text-center">
          <Dialog.Overlay className="fixed inset-0" />

          {/* This element is to trick the browser into centering the modal contents. */}
          <span
            className="inline-block h-screen align-middle"
            aria-hidden="true"
          >
            &#8203;
          </span>

          <div className="inline-block w-full max-w-md p-6 my-8 overflow-hidden text-left align-middle bg-light-500">
            <Dialog.Title
              as="h3"
              className="text-lg font-medium leading-6 text-dark-500"
            >
              {title}
            </Dialog.Title>
            <div className="mt-2">
              <p className="text-sm text-dark-500">{description}</p>
            </div>

            <div className="mt-4 w-full flex justify-end">
              <button
                type="button"
                className="button-dark text-dark-500"
                onClick={() => setIsOpen(false)}
              >
                {}
              </button>
            </div>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
