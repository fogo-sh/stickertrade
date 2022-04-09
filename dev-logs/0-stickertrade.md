---
title: 0 - stickertrade
date: "2022-03-15"
---

Sticker Trade is an idea I've had for quite some time, to build a simple sticker trading website, with emphasis on:

- community
- bartering
- <span class="text-primary-500">fun</span>

Think Facebook Marketplace, but if you only had one specific item you were showing off, and said item lacked much utility other than being _cool_. <span class="opacity-50">(also 100% less Zuck)</span>

Another thing that will hopefully make it novel, will be the introduction of an invite system similar to [Lobsters](https://lobste.rs/about#invitations), in which you require an invitation from someone who already has an account on the site to create your site.

Building out the entire 'invitation' tree similar to Lobsters as well is a planned feature.

---

From a technology stack perspective, I had briefly worked on an implementation of this website using [Phoenix](https://github.com/phoenixframework/phoenix), as an excuse to flex my [Elixir](https://elixir-lang.org/) muscles, and that site actually did progress relatively far.

I did however give up on that version of this site, my speed of development was quite... slow.

Phoenix didn't feel like the right tool for the job, I had some plans for some weird features that would make use of its brilliant realtime systems, but getting caught up on building a basic file upload interface really burned me out after spending more than 2 weeks working on it on-and-off.

---

So the current version of the site you are looking at is my second approach; it is being done using [Remix](https://remix.run/)!

Remix isn't something I have touched before this project, but since React is something I'm very comfortable with, speed of development here isn't a concern.

The goal of keeping it simple will go both ways, from the UX of the site, to the DX of it being developed.

Although I plan to use [Prisma](https://www.prisma.io/) as the ORM behind the project, production will run with a SQLite backend for simplicity of deployment to my existing DigitalOcean infrastructure.

It would be cool for the site to blow up, but I have a feeling that will likely not happen, and my decently cheap droplet will be able to handle the traffic of this website.

---

Already put in place within this version of the site (that at the writing of this log is literally just enough to have a list of dev posts and nothing else) is usage of [TailwindCSS](https://tailwindcss.com/), which I have used before, and will likely continue to use as my first choice of how to quickly approach building any sort of user interface.

---

After writing this post, my plan will then be to learn how to properly stuff a Remix application into a Docker container, and deploy it, even though it is just currently a site without any other purpose but to display these posts.

Something about stuff living in production makes me care about it more than if it is simply an idea in the back of my head, so the idea is that I will have more of a reason to work on the project if it is easier to do so (since a repo and everything already exists).

This also might be the last bit of work I do on the project, since my track record of personal project completion isn't very great.

But hey, I will try.
