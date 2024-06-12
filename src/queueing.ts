import queue from "p-queue";
import { Log } from "./utils";

export default class Queue {
    private globalQueue: queue;
    private namedQueues: Map<string, queue>;
    private namedQueuesActiveCount: number = 0;

    constructor() {
        this.globalQueue = new queue({ concurrency: 1 });
        this.namedQueues = new Map();
    }

    public AddToGlobalQueue(task: () => Promise<void>): void {
        this.globalQueue
            .add(task)
            .catch(e => {
                console.error("Error in global queue", e);
                throw e;
            })
            .finally(() => {
                Log(
                    "Global queue size:",
                    this.globalQueue.size,
                    " pending:",
                    this.globalQueue.pending
                );
            });
    }

    /** Runs the given task in a named queue. If the global queue isn't empty, the task will be added to the global queue instead. */
    public AddToQueue(objectName: string, task: () => Promise<void>): void {
        if (!this.namedQueues.has(objectName)) {
            this.namedQueues.set(objectName, new queue({ concurrency: 1 }));
        }

        const namedQueue = this.namedQueues.get(objectName)!;

        const wrappedTask = async () => {
            if (this.globalQueue.size === 0 && this.globalQueue.pending === 0) {
                await task();
            } else {
                await this.globalQueue.add(task);
            }
        };

        this.namedQueuesActiveCount++;
        namedQueue
            .add(wrappedTask)
            .catch(e => {
                console.error(
                    `Error in named queue for object ${objectName}`,
                    e
                );
                throw e;
            })
            .finally(() => {
                this.namedQueuesActiveCount--;
            });

        // Remove namedQueue from this.namedQueues when queue become empty
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        namedQueue.onIdle().finally(() => {
            if (namedQueue.size === 0 && namedQueue.pending === 0)
                this.namedQueues.delete(objectName);
        });
    }
}
