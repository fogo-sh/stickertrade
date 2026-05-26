// @ts-expect-error
import tailwindConfig from "../../tailwind.config";

type ColorKey = "primary" | "secondary" | "dark" | "light";
type ColorVariant = 500 | 600 | 700;

export type Colors = {
  [key in ColorKey]: {
    [key in ColorVariant]?: string;
  };
};

export const colors: Colors = tailwindConfig.theme.extend.colors;
