import { faker } from "@faker-js/faker";
import { UserRoles } from "~/types";
import { db } from "~/utils/db.server";
import { hash } from "~/utils/perms.server";

// TODO eventually use actual user creation code rather than raw user create logic
export const generateUser = async ({
  username = faker.internet.userName(),
  password = faker.internet.password(),
  role = UserRoles.User,
} = {}) => {
  const user = await db.user.create({
    data: {
      username,
      passwordHash: await hash(password),
      role,
    },
  });

  return user;
};
