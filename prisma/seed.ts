import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const salt = bcrypt.genSaltSync(10);
const defaultPassword = "password";

const db = new PrismaClient();

const users = [
  {
    username: "jack",
    avatarUrl: "/test-data/avatars/jack.webp",
    passwordHash: bcrypt.hashSync(defaultPassword, salt),
  },
  {
    username: "david",
    avatarUrl: "/test-data/avatars/david.webp",
    passwordHash: bcrypt.hashSync(defaultPassword, salt),
  },
  {
    username: "mitch",
    avatarUrl: "/test-data/avatars/mitch.webp",
    passwordHash: bcrypt.hashSync(defaultPassword, salt),
  },
  {
    username: "ethan",
    avatarUrl: "/test-data/avatars/ethan.webp",
    passwordHash: bcrypt.hashSync(defaultPassword, salt),
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
  for (const user of users) {
    await db.user.upsert({
      where: { username: user.username },
      update: {},
      create: {
        username: user.username,
        passwordHash: user.passwordHash,
        avatarUrl: user.avatarUrl,
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
