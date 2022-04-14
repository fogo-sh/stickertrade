export const USER_ROLE = {
  ADMIN: "ADMIN",
  USER: "USER",
};

export type Serialized<T> = {
  [P in keyof T]: T[P] extends Date ? string : Serialized<T[P]>;
};
