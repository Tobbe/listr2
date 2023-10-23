---
author:
  name: Cenk Kılıç
  url: https://cenk.kilic.dev
  email: cenk@kilic.dev
title: Listr
order: 20
tag:
  - mandatory
  - basic
category:
  - listr
---

`listr2` is a stateful task list, therefore it is based on classes. To create a new task list, you must create an instance of [Listr](/api/classes/listr2.Listr.html) first.

<!-- more -->

## Generate New Class

Import and create a new task list from the prototype. It will return the created [Listr](/api/classes/listr2.Listr.html) class.

@[code{-14} typescript{1,7}](../../examples/docs/listr/new-listr/creating-a-new-instance.ts)

## Run the Generated Task List

Then you can run this task list as an `async` function and as the result, it will return the context through the tasks.

@[code{16-} typescript{2}](../../examples/docs/listr/new-listr/creating-a-new-instance.ts)
