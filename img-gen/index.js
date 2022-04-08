const express = require("express");
const fs = require("fs");
const { chromium } = require("playwright");
const sharp = require("sharp");
const Mustache = require("mustache");

require("dotenv").config();

const port = process.env.PORT ?? 4000;

const app = express();
app.use(express.json());

const css = fs.readFileSync("./tailwind.css", "utf8");

const content = /* HTML */ `<!DOCTYPE html>
  <html lang="en" class="h-full">
    <head>
      <meta charset="UTF-8" />
      <style>
        ${css}
      </style>
    </head>
    <body class="flex flex-col justify-center p-16 h-full bg-dark-500">
      <h1 class="text-[5rem]">{{ header }}</h1>
      <h2 class="text-[3rem]">{{ subHeader }}</h2>
    </body>
  </html>`;

async function generateImage({ header, subHeader }) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 600 } });

  await page.setContent(Mustache.render(content, { header, subHeader }));

  const buffer = await page.screenshot();
  await browser.close();
  return sharp(buffer).webp().toBuffer();
}

app.post("/", function (req, res) {
  try {
    generateImage(req.body).then((data) => res.type("webp").send(data));
  } catch (err) {
    res.status(500).send("Internal server error while generating image");
    return;
  }
});

app.listen(port, () => console.log(`Listening on port ${port}`));
