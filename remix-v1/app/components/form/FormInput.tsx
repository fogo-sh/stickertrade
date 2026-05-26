import type { HTMLInputTypeAttribute } from "react";
import { useField } from "remix-validated-form";

type FormInputProps = {
  name: string;
  label: string;
  type?: HTMLInputTypeAttribute;
  accept?: string;
};

export const FormInput = ({
  name,
  label,
  type = "text",
  accept = undefined,
}: FormInputProps) => {
  const { error, getInputProps } = useField(name);
  return (
    <div className="flex flex-col my-2">
      <label htmlFor={name} className="mb-2">
        {label}
      </label>
      <input {...getInputProps({ id: name, type, accept })} />
      {error && (
        <span className="text-primary-500 italic text-sm mt-1">{error}</span>
      )}
    </div>
  );
};

export const HiddenFormInput = ({
  name,
  value,
}: {
  name: string;
  value: string;
}) => {
  const { getInputProps } = useField(name);
  return <input {...getInputProps({ id: name, type: "hidden", value })} />;
};
