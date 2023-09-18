import { delay, Listr } from 'listr2'
import { Observable } from 'rxjs'

const tasks = new Listr(
  [
    {
      // Task can also handle and observable
      title: 'Observable test.',
      task: (): Observable<string> =>
        new Observable((observer) => {
          observer.next('test')

          void delay(500)
            .then(() => {
              observer.next('changed')

              return delay(500)
            })
            .then(() => {
              observer.complete()
            })
        })
    }
  ],
  { concurrent: false }
)

await tasks.run()
