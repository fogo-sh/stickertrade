import { Listbox } from "@headlessui/react";
import { CheckIcon, SelectorIcon } from "@heroicons/react/solid";
import clsx from "clsx";

interface Option {
  name: string;
}

export function Select({
  options,
  selected,
  setSelected,
}: {
  options: Option[];
  selected: Option;
  setSelected: (value: Option) => void;
}) {
  return (
    <Listbox value={selected} onChange={setSelected}>
      <div className="relative w-full">
        <Listbox.Button className="relative w-full py-2 pl-3 pr-10 text-left rounded cursor-default border border-light-500 border-opacity-50">
          <span className="block truncate">{selected.name}</span>
          <span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
            <SelectorIcon
              className="w-5 h-5 text-light-500"
              aria-hidden="true"
            />
          </span>
        </Listbox.Button>

        <Listbox.Options className="absolute w-full py-1 mt-1 overflow-auto text-base bg-dark-500 rounded max-h-60 border border-light-500 border-opacity-50">
          {options.map((option, optionIdx) => (
            <Listbox.Option
              key={optionIdx}
              className={({ active }) =>
                `cursor-default select-none relative py-2 pl-10 pr-4 ${
                  active ? "bg-light-700" : "text-dark-500"
                }`
              }
              value={option}
            >
              {({ selected, active }) => (
                <>
                  <span
                    className={clsx("block truncate", {
                      "font-medium": selected,
                      "font-normal": !selected,
                      "text-dark-500": active,
                    })}
                  >
                    {option.name}
                  </span>
                  {selected ? (
                    <span
                      className={clsx(
                        "absolute inset-y-0 left-0 flex items-center pl-3",
                        { "text-primary-500": !active, "text-dark-500": active }
                      )}
                    >
                      <CheckIcon className="w-5 h-5" aria-hidden="true" />
                    </span>
                  ) : null}
                </>
              )}
            </Listbox.Option>
          ))}
        </Listbox.Options>
      </div>
    </Listbox>
  );
}
