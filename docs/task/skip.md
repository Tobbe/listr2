---
author:
  name: Cenk Kılıç
  url: https://cenk.kilic.dev
  email: cenk@kilic.dev
title: Conditional Skip
order: 50
tag:
  - basic
  - flow
category:
  - task
---

Conditional skip is another way of enabling a _Task_ depending on the given context. But the main difference between `enable` and `skip` is `skip` will always render the given task. When the execution time comes, and it turns out that it should be skipped, it will render or mark it as skipped.

<!-- more -->

::: warning

Please pay attention to asynchronous operation while designing a context-enabled task list since it does not wait for any variable in the context.

:::

::: info Example

You can find the related examples [here](https://github.com/listr2/listr2/tree/master/examples/task-skip.example.ts).

:::

## Usage

Skip call can either have or not have a message, therefore it is optional. Having a message combined with the selected renderer and its settings will yield a different output, where skip message could be directly shown.

## Skip inside a _Task_

@[code{3-} typescript{6}](../../examples/docs/task/skip/inside.ts)

## Skip conditionally defining the _Task_

@[code{3-} typescript{6,12}](../../examples/docs/task/skip/task.ts)

## Renderer

### _DefaultRenderer_

The default renderer has options where you can change how the skip messages are displayed.

::: details

<!-- @include: ../api/interfaces/listr2.ListrDefaultRendererOptions.md{170-225} -->

:::
