import clsx from "clsx";
import { useIsSubmitting } from "remix-validated-form";

export const SubmitButton = ({
  className = "",
  submitting = "Submitting...",
  submit = "Submit",
}) => {
  const isSubmitting = useIsSubmitting();
  return (
    <button
      type="submit"
      disabled={isSubmitting}
      className={clsx("button-light", className)}
    >
      {isSubmitting ? submitting : submit}
    </button>
  );
};
