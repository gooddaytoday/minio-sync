import queue from "p-queue";
import { DebugFail, GUID } from "./utils";

export default class Queueing {
    private globalQueue: queue = new queue({ concurrency: 1 });
    private queueMap = new Map<string, queue>();
    private queueMapActiveCount: number = 0;

    /** Adds cb to global queue that run exclusive after all in queueMap and non-concurrent with new in queueMap */
    public AddToGlobalQueue(cb: () => Promise<void>): void {
        let task: Promise<void> | undefined;
        if (this.queueMap.size > 0) {
            const allQueues = Array.from(this.queueMap.values()).map(q =>
                q.onIdle()
            );
            const newGlobalTask = Promise.all(allQueues).then(cb);
            task = this.globalQueue.add(() => newGlobalTask);
        } else {
            task = this.globalQueue.add(cb);
        }
        task.catch(e => {
            console.error("Error in global queue", e);
            throw e;
        });
    }

    /** Adds cb to queue for objectName. If globalQueue is not empty, cb will run after all in queueMap */
    public AddToQueue(objectName: string, cb: () => Promise<void>): void {
        let objQueue = this.queueMap.get(objectName);
        if (this.globalQueue.size > 0 || this.globalQueue.pending > 0) {
            const newTask = this.globalQueue.onIdle().then(cb);
            cb = () => newTask;

            if (objQueue && (objQueue.size > 0 || objQueue.pending > 0)) {
                // Rename queue to avoid endless global queue if there was task for this object before global queue
                this.RenameQueue(objectName, objQueue);
                objQueue = undefined; // Make it undefined to create new queue
            }
        }

        if (!objQueue) {
            objQueue = new queue({ concurrency: 1 });
            this.queueMap.set(objectName, objQueue);
        }
        objQueue.add(cb).catch(e => {
            console.error(`Error in queue of object ${objectName}`, e);
            throw e;
        });

        this.queueMapActiveCount++;
        void objQueue.onIdle().finally(() => {
            if (--this.queueMapActiveCount == 0) {
                for (const [key, value] of this.queueMap) {
                    if (value.size == 0 && value.pending == 0) {
                        this.queueMap.delete(key);
                    } else {
                        DebugFail(`Queue for ${key} should be empty`);
                    }
                }
            }
        });
    }

    private RenameQueue(objectName: string, queue: queue) {
        this.queueMap.delete(objectName); // Remove from map to create new
        const newObjectName = `${objectName}_${GUID()}`;
        this.queueMap.set(newObjectName, queue);
    }
}
