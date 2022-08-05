import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { UserRoles } from "~/types";

const salt = bcrypt.genSaltSync(10);
const defaultPassword = "password";

const db = new PrismaClient();

// TODO depricate usage of 'test-data' dir, and test uploading actual images -> minio during seed

const users = [
  {
    username: "david",
    avatarUrl: "/test-data/avatars/david.webp",
    passwordHash: bcrypt.hashSync(defaultPassword, salt),
    role: UserRoles.User,
  },
  {
    username: "mitch",
    avatarUrl: "/test-data/avatars/mitch.webp",
    passwordHash: bcrypt.hashSync(defaultPassword, salt),
    role: UserRoles.User,
  },
  {
    username: "ethan",
    avatarUrl: "/test-data/avatars/ethan.webp",
    passwordHash: bcrypt.hashSync(defaultPassword, salt),
    role: UserRoles.User,
  },
];

interface Sticker {
  name: string;
  imageUrl: string;
  owner?: string;
}

const grack = {
  name: "Grack",
  imageUrl: "/test-data/stickers/grack.webp",
  owner: "jack",
};

const stickers: Sticker[] = [
  ...Array.from<Sticker>({ length: 30 }).fill(grack),
  {
    name: "I <3 NL Trains",
    imageUrl: "/test-data/stickers/trains.webp",
    owner: "david",
  },
  {
    name: "Fogo.sh",
    imageUrl: "/test-data/stickers/fogo.webp",
    owner: "mitch",
  },
  {
    name: "Mule",
    imageUrl: "/test-data/stickers/mule.webp",
  },
  {
    name: "CTSNL",
    imageUrl: "/test-data/stickers/ctsnl.webp",
    owner: "jack",
  },
  {
    name: "CTSNL owned by nobody",
    imageUrl: "/test-data/stickers/ctsnl.webp",
  },
  {
    name: "pogfish",
    imageUrl: "/test-data/stickers/pogfish.webp",
    owner: "ethan",
  },
  {
    name: "Tim",
    imageUrl: "/test-data/stickers/tim.webp",
    owner: "jack",
  },
];

async function seed() {
  await db.config.create({
    data: {
      invitationsEnabled: true,
    },
  });

  const rootUser = await db.user.create({
    data: {
      username: "jack",
      role: UserRoles.Admin,
      avatarUrl: "/test-data/avatars/jack.webp",
      passwordHash: bcrypt.hashSync(defaultPassword, salt),
    },
  });

  for (const user of users) {
    await db.invitation.create({
      data: {
        fromId: rootUser.id,
        to: {
          create: {
            username: user.username,
            passwordHash: user.passwordHash,
            avatarUrl: user.avatarUrl,
            role: user.role,
          },
        },
      },
    });
  }

  for (const sticker of stickers) {
    await db.sticker.create({
      data: {
        name: sticker.name,
        imageUrl: sticker.imageUrl,
        ...(sticker.owner
          ? { owner: { connect: { username: sticker.owner } } }
          : {}),
      },
    });
  }
}

seed();
