import type { HTMLInputTypeAttribute } from "react";
import { useField } from "remix-validated-form";

type FormInputProps = {
  name: string;
  label: string;
  type?: HTMLInputTypeAttribute;
};

export const FormInput = ({ name, label, type = "text" }: FormInputProps) => {
  const { error, getInputProps } = useField(name);
  return (
    <div className="flex flex-col my-2">
      <label htmlFor={name} className="mb-2">
        {label}
      </label>
      <input {...getInputProps({ id: name, type })} />
      {error && (
        <span className="text-primary-500 italic text-sm mt-1">{error}</span>
      )}
    </div>
  );
};
