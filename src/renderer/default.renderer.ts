import cliTruncate from 'cli-truncate'
import type { LogUpdate } from 'log-update'
import logUpdate from 'log-update'
import { EOL } from 'os'
import cliWrap from 'wrap-ansi'

import { ListrEventType } from '@constants/event.constants'
import type { ListrEventMap } from '@interfaces/event-map.interface'
import type { ListrContext } from '@interfaces/listr.interface'
import type { ListrRenderer } from '@interfaces/renderer.interface'
import type { EventManager } from '@lib/event-manager'
import type { Task } from '@lib/task'
import type { RendererPresetTimer } from '@presets'
import type { LoggerRendererOptions } from '@utils'
import { assertFunctionOrSelf, color, figures, indentString, ListrLogger, LogLevels, Spinner } from '@utils'

/** Default updating renderer for Listr2 */
export class DefaultRenderer implements ListrRenderer {
  /** designates whether this renderer can output to a non-tty console */
  public static nonTTY = false
  /** renderer options for the defauult renderer */
  public static rendererOptions: {
    /**
     * indentation per level of subtask
     *
     * @default 2
     */
    indentation?: number
    /**
     * clear all the output generated by the renderer when the task finishes its execution
     *
     * @default false
     * @global global option that can not be temperated with subtasks
     */
    clearOutput?: boolean
    /**
     * show the subtasks of the current task
     *
     * @default true
     */
    showSubtasks?: boolean
    /**
     * collapse subtasks after current task completes its execution
     *
     * @default true
     */
    collapse?: boolean
    /**
     * show skip messages or show the original title of the task, this will also disable collapseSkips mode
     *
     * You can disable showing the skip messages, even though you passed in a message by settings this option,
     * if you want to keep the original task title intact.
     *
     * @default true
     */
    showSkipMessage?: boolean
    /**
     * collapse skip messages into a single message and overwrite the task title
     *
     * @default true
     */
    collapseSkips?: boolean
    /**
     * suffix skip messages with [SKIPPED] when in collapseSkips mode
     *
     * @default true
     */
    suffixSkips?: boolean
    /**
     * shows the thrown error message or show the original title of the task, this will also disable collapseErrors mode
     * You can disable showing the error messages, even though you passed in a message by settings this option,
     * if you want to keep the original task title intact.
     *
     * @default true
     */
    showErrorMessage?: boolean
    /**
     * collapse error messages into a single message and overwrite the task title
     *
     * @default true
     */
    collapseErrors?: boolean
    /**
     * suffix retry messages with [RETRY-${COUNT}] when retry is enabled for a task
     *
     * @default true
     */
    suffixRetries?: boolean
    /**
     * only update through triggers from renderhook
     *
     * useful for tests and stuff. this will disable showing spinner and only update the screen if something else has
     * happened in the task worthy to show
     *
     * @default false
     * @global global option that can not be temperated with subtasks
     */
    lazy?: boolean
    /**
     * activate update through triggers from render hook
     *
     * @default true
     * @global global option that can not be temperated with subtasks
     */
    eager?: boolean
    /**
     * removes empty lines from the data output
     *
     * @default true
     */
    removeEmptyLines?: boolean
    /**
     * formats data output depending on your requirements.
     *
     * @default 'truncate'
     * @global global option that can not be temperated with subtasks
     */
    formatOutput?: 'truncate' | 'wrap'
  } & RendererPresetTimer &
  LoggerRendererOptions = {
      indentation: 2,
      clearOutput: false,
      showSubtasks: true,
      collapse: true,
      collapseSkips: true,
      showSkipMessage: true,
      suffixSkips: true,
      collapseErrors: true,
      showErrorMessage: true,
      suffixRetries: true,
      lazy: false,
      eager: true,
      removeEmptyLines: true,
      formatOutput: 'truncate'
    }

  /** per task options for the default renderer */
  public static rendererTaskOptions: {
    /**
     * write task output to the bottom bar instead of the gap under the task title itself.
     * useful for a stream of data.
     * @default false
     *
     * `true` only keep 1 line of the latest data outputted by the task.
     * `false` only keep 1 line of the latest data outputted by the task.
     * `number` will keep designated data of the latest data outputted by the task.
     */
    bottomBar?: boolean | number
    /**
     * keep output after task finishes
     * @default false
     *
     * works both for the bottom bar and the default behavior
     */
    persistentOutput?: boolean
  } & RendererPresetTimer

  private bottomBar: Record<string, { data?: string[], items?: number }> = {}
  private promptBar: string
  private readonly spinner = new Spinner()
  private readonly logger: ListrLogger
  private readonly updater: LogUpdate

  constructor (
    public tasks: Task<any, typeof DefaultRenderer>[],
    public options: (typeof DefaultRenderer)['rendererOptions'],
    public events: EventManager<ListrEventType, ListrEventMap>
  ) {
    this.options = { ...DefaultRenderer.rendererOptions, ...this.options }

    this.logger = this.options.logger ?? new ListrLogger()
    this.updater = logUpdate.create(this.logger.process.stdout)
  }

  public getTaskOptions (task: Task<any, typeof DefaultRenderer>): (typeof DefaultRenderer)['rendererTaskOptions'] {
    return { ...DefaultRenderer.rendererTaskOptions, ...task.rendererTaskOptions }
  }

  public isBottomBar (task: Task<any, typeof DefaultRenderer>): boolean {
    const bottomBar = this.getTaskOptions(task).bottomBar

    return typeof bottomBar === 'number' && bottomBar !== 0 || typeof bottomBar === 'boolean' && bottomBar !== false
  }

  public hasPersistentOutput (task: Task<any, typeof DefaultRenderer>): boolean {
    return this.getTaskOptions(task).persistentOutput === true
  }

  public getSelfOrParentOption<K extends keyof (typeof DefaultRenderer)['rendererOptions']>(
    task: Task<any, typeof DefaultRenderer>,
    key: K
  ): (typeof DefaultRenderer)['rendererOptions'][K] {
    return task?.rendererOptions?.[key] ?? this.options?.[key]
  }

  public render (): void {
    // Do not render if we are already rendering
    if (this.spinner.isRunning()) {
      return
    }

    this.logger.process.hijack()

    const updateRender = (): void => this.updater(this.createRender())

    /* istanbul ignore if */
    if (!this.options?.lazy) {
      this.spinner.start(() => {
        updateRender()
      })
    }

    if (this.options?.eager) {
      this.events.on(ListrEventType.SHOULD_REFRESH_RENDER, () => {
        updateRender()
      })
    }
  }

  public end (): void {
    this.spinner.stop()

    // clear log updater
    this.updater.clear()
    this.updater.done()

    // directly write to process.stdout, since logupdate only can update the seen height of terminal
    if (!this.options.clearOutput) {
      this.logger.process.writeToStdout(this.createRender({ prompt: false }))
    }

    this.logger.process.release()
  }

  public createRender (options?: { tasks?: boolean, bottomBar?: boolean, prompt?: boolean }): string {
    options = {
      tasks: true,
      bottomBar: true,
      prompt: true,
      ...options
    }

    const render: string[] = []

    const renderTasks = this.renderer(this.tasks)
    const renderBottomBar = this.renderBottomBar()
    const renderPrompt = this.renderPrompt()

    if (options.tasks && renderTasks.length > 0) {
      render.push(...renderTasks)
    }

    if (options.bottomBar && renderBottomBar.length > 0) {
      if (render.length > 0) {
        render.push('')
      }

      render.push(...renderBottomBar)
    }

    if (options.prompt && renderPrompt.length > 0) {
      if (render.length > 0) {
        render.push('')
      }

      render.push(...renderPrompt)
    }

    return render.join(EOL)
  }

  // eslint-disable-next-line complexity
  protected style (task: Task<ListrContext, typeof DefaultRenderer>, data = false): string {
    if (task.isSkipped() && (data || this.getSelfOrParentOption(task, 'collapseSkips'))) {
      return color.yellow(figures.arrowDown)
    }

    if (data) {
      return figures.pointerSmall
    }

    if (task.isStarted()) {
      return this.options?.lazy || this.getSelfOrParentOption(task, 'showSubtasks') !== false && task.hasSubtasks() && !task.subtasks.every((subtask) => !subtask.hasTitle())
        ? color.yellow(figures.pointer)
        : color.yellowBright(this.spinner.fetch())
    } else if (task.isCompleted()) {
      return task.hasSubtasks() && task.subtasks.some((subtask) => subtask.hasFailed()) ? color.yellow(figures.warning) : color.green(figures.tick)
    } else if (task.isRetrying()) {
      return this.options?.lazy ? color.yellowBright(figures.warning) : color.yellowBright(this.spinner.fetch())
    } else if (task.isRollingBack()) {
      return this.options?.lazy ? color.redBright(figures.warning) : color.redBright(this.spinner.fetch())
    } else if (task.hasRolledBack()) {
      return color.redBright(figures.arrowLeft)
    } else if (task.hasFailed()) {
      return task.hasSubtasks() ? color.red(figures.pointer) : color.red(figures.cross)
    } else if (task.isSkipped() && this.getSelfOrParentOption(task, 'collapseSkips') === false) {
      return color.yellow(figures.warning)
    }

    return color.dim(figures.squareSmallFilled)
  }

  protected format (message: string, icon: string, level: number): string[] {
    // we dont like empty data around here
    if (message.trim() === '') {
      return []
    }

    message = `${icon} ${message}`
    let parsed: string[]

    let columns = process.stdout.columns ? process.stdout.columns : 80

    columns = columns - level * this.options.indentation - 2

    switch (this.options.formatOutput) {
    case 'truncate':
      parsed = message.split(EOL).map((s, i) => {
        return cliTruncate(this.indent(s, i), columns)
      })

      break

    case 'wrap':
      parsed = cliWrap(message, columns, { hard: true })
        .split(EOL)
        .map((s, i) => this.indent(s, i))

      break

    default:
      throw new Error('Format option for the renderer is wrong.')
    }

    // this removes the empty lines
    if (this.options.removeEmptyLines) {
      parsed = parsed.filter(Boolean)
    }

    return parsed.map((str) => indentString(str, level * this.options.indentation))
  }

  private renderer (tasks: Task<any, typeof DefaultRenderer>[], level = 0): string[] {
    // eslint-disable-next-line complexity
    return tasks.flatMap((task) => {
      const output: string[] = []

      if (!task.isEnabled()) {
        return []
      }

      // Current Task Title
      if (task.hasTitle()) {
        if (!(tasks.some((task) => task.hasFailed()) && !task.hasFailed() && task.options.exitOnError !== false && !(task.isCompleted() || task.isSkipped()))) {
          // if task is skipped
          if (task.hasFailed() && this.getSelfOrParentOption(task, 'collapseErrors')) {
            // current task title and skip change the title
            output.push(
              ...this.format(
                !task.hasSubtasks() && task.message.error && this.getSelfOrParentOption(task, 'showErrorMessage') ? task.message.error : task.title,
                this.style(task),
                level
              )
            )
          } else if (task.isSkipped() && this.getSelfOrParentOption(task, 'collapseSkips')) {
            // current task title and skip change the title
            output.push(
              ...this.format(
                this.logger.suffix(task.message.skip && this.getSelfOrParentOption(task, 'showSkipMessage') ? task.message.skip : task.title, {
                  data: LogLevels.SKIPPED,
                  condition: this.getSelfOrParentOption(task, 'suffixSkips'),
                  format: color.dim
                }),
                this.style(task),
                level
              )
            )
          } else if (task.isRetrying() && this.getSelfOrParentOption(task, 'suffixRetries')) {
            output.push(
              ...this.format(
                this.logger.suffix(task.title, {
                  data: `${LogLevels.RETRY}:${task.message.retry.count}`,
                  format: color.yellow
                }),
                this.style(task),
                level
              )
            )
          } else if (task.isCompleted() && task.hasTitle() && assertFunctionOrSelf(this.getSelfOrParentOption(task, 'timer')?.condition, task.message.duration)) {
            // task with timer
            output.push(
              ...this.format(
                this.logger.suffix(task?.title, {
                  ...this.getSelfOrParentOption(task, 'timer'),
                  args: [ task.message.duration ]
                }),
                this.style(task),
                level
              )
            )
          } else {
            // normal state
            output.push(...this.format(task.title, this.style(task), level))
          }
        } else {
          // some sibling task but self has failed and this has stopped
          output.push(...this.format(task.title, color.red(figures.squareSmallFilled), level))
        }
      }

      // task should not have subtasks since subtasks will handle the error already
      // maybe it is a better idea to show the error or skip messages when show subtasks is disabled.
      if (!task.hasSubtasks() || !this.getSelfOrParentOption(task, 'showSubtasks')) {
        // without the collapse option for skip and errors
        if (
          task.hasFailed() &&
          this.getSelfOrParentOption(task, 'collapseErrors') === false &&
          (this.getSelfOrParentOption(task, 'showErrorMessage') || !this.getSelfOrParentOption(task, 'showSubtasks'))
        ) {
          // show skip data if collapsing is not defined
          output.push(...this.dump(task, level, LogLevels.FAILED))
        } else if (
          task.isSkipped() &&
          this.getSelfOrParentOption(task, 'collapseSkips') === false &&
          (this.getSelfOrParentOption(task, 'showSkipMessage') || !this.getSelfOrParentOption(task, 'showSubtasks'))
        ) {
          // show skip data if collapsing is not defined
          output.push(...this.dump(task, level, LogLevels.SKIPPED))
        }
      }

      // Current Task Output
      if (task?.output) {
        if (task.isPending() && task.isPrompt()) {
          // data output to prompt bar if prompt
          this.promptBar = task.output
        } else if (this.isBottomBar(task) || !task.hasTitle()) {
          // data output to bottom bar
          const data = this.dump(task, -1)

          // create new if there is no persistent storage created for bottom bar
          if (!this.bottomBar[task.id]) {
            this.bottomBar[task.id] = {}
            this.bottomBar[task.id].data = []

            const bottomBar = this.getTaskOptions(task).bottomBar

            if (typeof bottomBar === 'boolean') {
              this.bottomBar[task.id].items = 1
            } else {
              this.bottomBar[task.id].items = bottomBar
            }
          }

          // persistent bottom bar and limit items in it
          if (!this.bottomBar[task.id]?.data?.some((element) => data.includes(element)) && !task.isSkipped()) {
            this.bottomBar[task.id].data.push(...data)
          }
        } else if (task.isPending() || this.hasPersistentOutput(task)) {
          // keep output if persistent output is set
          output.push(...this.dump(task, level))
        }
      }

      // render subtasks, some complicated conditionals going on
      if (
        // check if renderer option is on first
        this.getSelfOrParentOption(task, 'showSubtasks') !== false &&
        // if it doesnt have subtasks no need to check
        task.hasSubtasks() &&
        (task.isPending() ||
          task.hasFinalized() && !task.hasTitle() ||
          // have to be completed and have subtasks
          task.isCompleted() && this.getSelfOrParentOption(task, 'collapse') === false && !task.subtasks.some((subtask) => subtask.rendererOptions.collapse === true) ||
          // if any of the subtasks have the collapse option of
          task.subtasks.some((subtask) => subtask.rendererOptions.collapse === false) ||
          // if any of the subtasks has failed
          task.subtasks.some((subtask) => subtask.hasFailed()) ||
          // if any of the subtasks rolled back
          task.subtasks.some((subtask) => subtask.hasRolledBack()))
      ) {
        // set level
        const subtaskLevel = !task.hasTitle() ? level : level + 1

        // render the subtasks as in the same way
        const subtaskRender = this.renderer(task.subtasks, subtaskLevel)

        output.push(...subtaskRender)
      }

      // after task is finished actions
      if (task.hasFinalized()) {
        // clean up prompts
        this.promptBar = null

        // clean up bottom bar items if not indicated otherwise
        if (!this.hasPersistentOutput(task)) {
          delete this.bottomBar[task.id]
        }
      }

      return output
    })
  }

  private renderBottomBar (): string[] {
    // parse through all objects return only the last mentioned items
    if (Object.keys(this.bottomBar).length === 0) {
      return []
    }

    this.bottomBar = Object.keys(this.bottomBar).reduce<Record<PropertyKey, { data?: string[], items?: number }>>((o, key) => {
      if (!o?.[key]) {
        o[key] = {}
      }

      o[key] = this.bottomBar[key]

      this.bottomBar[key].data = this.bottomBar[key].data.slice(-this.bottomBar[key].items)
      o[key].data = this.bottomBar[key].data

      return o
    }, {})

    return Object.values(this.bottomBar).reduce((o, value) => o = [ ...o, ...value.data ], [])
  }

  private renderPrompt (): string[] {
    if (!this.promptBar) {
      return []
    }

    return [ this.promptBar ]
  }

  private dump (task: Task<ListrContext, typeof DefaultRenderer>, level: number, source: LogLevels.OUTPUT | LogLevels.SKIPPED | LogLevels.FAILED = LogLevels.OUTPUT): string[] {
    let data: string | boolean

    switch (source) {
    case LogLevels.OUTPUT:
      data = task.output

      break

    case LogLevels.SKIPPED:
      data = task.message.skip

      break

    case LogLevels.FAILED:
      data = task.message.error

      break
    }

    // dont return anything on some occasions
    if (task.hasTitle() && source === LogLevels.FAILED && data === task.title) {
      return []
    }

    if (typeof data === 'string') {
      return this.format(data, this.style(task, true), level + 1)
    }

    return []
  }

  private indent (str: string, i: number): string {
    return i > 0 ? indentString(str.trim(), 2) : str.trim()
  }
}
