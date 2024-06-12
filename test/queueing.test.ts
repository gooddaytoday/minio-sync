import queue from "p-queue";
import QueueingClass from "../src/queueing";
import { testsCommon } from "./testsCommon";

const Task = testsCommon.Task;

class Queueing {
    private queueing = new QueueingClass();
    constructor() {}

    public get namedQueueActiveCount(): number {
        return this.queueing["namedQueuesActiveCount"];
    }

    public get globalQueue(): queue {
        return this.queueing["globalQueue"];
    }

    public get namedQueues(): Map<string, queue> {
        return this.queueing["namedQueues"];
    }

    public get namedQueuesIdle(): Promise<void[]> {
        return Promise.all(
            Array.from(this.namedQueues.values()).map(q => q.onIdle())
        );
    }

    public AddToGlobalQueue(cb: () => Promise<void>): void {
        this.queueing.AddToGlobalQueue(cb);
    }

    public AddToQueue(objectName: string, cb: () => Promise<void>): void {
        this.queueing.AddToQueue(objectName, cb);
    }
}

describe("Queueing", () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    const DefaultObjectName = "example.txt";

    // AddToGlobalQueue method adds task to globalQueue
    it("should add task to globalQueue when AddToGlobalQueue is called", () => {
        const queueing = new Queueing();
        const cb = jest.fn();
        queueing["AddToGlobalQueue"](cb);
        expect(cb).toHaveBeenCalled();
    });

    // AddToQueue method adds task to queue for objectName
    it("should add task to queue for objectName when AddToQueue is called", () => {
        const queueing = new Queueing();
        const cb = jest.fn();
        queueing["AddToQueue"](DefaultObjectName, cb);
        expect(cb).toHaveBeenCalled();
    });

    it("should add cb to queue for objectName when globalQueue size is 0", () => {
        const queueing = new Queueing();
        const cb = jest.fn();

        // Assert that globalQueue size is 0
        expect(queueing["globalQueue"].size).toBe(0);

        expect(() => {
            queueing.AddToQueue(DefaultObjectName, cb);
        }).not.toThrow();
        expect(cb).toHaveBeenCalled();
    });

    it("should add cb to queue for objectName when objQueue already exists", () => {
        const queueing = new Queueing();
        const cb = jest.fn().mockResolvedValue({});

        queueing.namedQueues.set(
            DefaultObjectName,
            new queue({ concurrency: 1 })
        );

        expect(() => {
            queueing.AddToQueue(DefaultObjectName, cb);
        }).not.toThrow();
        expect(cb).toHaveBeenCalled();
    });

    // Adds cb to global queue if namedQueues is empty
    it("should add cb to global queue if namedQueues is empty", () => {
        const queueing = new Queueing();
        const cb = jest.fn().mockResolvedValue({});

        queueing.AddToGlobalQueue(cb);

        expect(queueing.globalQueue.size).toBe(0);
        expect(queueing.globalQueue.pending).toBe(1);
        expect(cb).toHaveBeenCalledTimes(1);
    });

    // Test case that checks "this.globalQueue.size > 0" condition branch
    it("should add cb to queue for objectName when this.globalQueue.size > 0", async () => {
        const queueing = new Queueing();
        const sequenceResult: ("global" | "objectQueue")[] = [];
        const cb = () => Task(() => sequenceResult.push("objectQueue"));

        // Add a task to the global queue to simulate non-empty global queue
        void queueing.globalQueue.add(() =>
            Task(() => sequenceResult.push("global"))
        );

        // Add a task to the object queue
        queueing.AddToQueue(DefaultObjectName, cb);

        // Check that the object queue is created and has the task
        expect(queueing.namedQueues.has(DefaultObjectName)).toBe(true);
        expect(queueing.namedQueues.get(DefaultObjectName)).toBeInstanceOf(
            queue
        );
        expect(queueing.namedQueues.get(DefaultObjectName)?.size).toBe(0);
        expect(queueing.namedQueues.get(DefaultObjectName)?.pending).toBe(1);

        // Wait for the global queue to become idle
        await queueing.globalQueue.onIdle();

        // Wait for the task of objectName to be executed
        await queueing.namedQueues.get(DefaultObjectName)?.onIdle();

        // Check that the task in the object queue has been executed
        // by checking that the object queue is empty
        expect(queueing.namedQueues.has(DefaultObjectName)).toBe(false);

        // Check the sequence of tasks
        expect(sequenceResult).toEqual(["global", "objectQueue"]);
    });

    // If globalQueue is not empty, AddToQueue runs cb after all in namedQueues and globalQueue
    it("should run object's cb after globalQueue if globalQueue is not empty", async () => {
        const queueing = new Queueing();
        const objectName = "testObject";
        type TResults = "global" | "objectQueue";
        const sequenceResult: TResults[] = [];
        const objectTask = jest
            .fn()
            .mockImplementation(() => sequenceResult.push("objectQueue"));
        const globalCbTask = jest
            .fn()
            .mockImplementation(() => sequenceResult.push("global"));

        const namedQueuesGetSpy = jest.spyOn(queueing["namedQueues"], "get");

        queueing.AddToGlobalQueue(() => Task(globalCbTask));
        queueing.AddToQueue(objectName, () => Task(objectTask));

        expect(namedQueuesGetSpy).toHaveBeenCalledWith(objectName);

        await queueing["namedQueues"].get(objectName)!.onIdle();
        expect(objectTask).toHaveBeenCalled();
        expect(sequenceResult).toEqual(["global", "objectQueue"]);
    });

    it("should decrement namedQueuesActiveCount when a queue becomes empty", async () => {
        const queueing = new Queueing();
        const cb = jest.fn(() => Task());
        const objQueue = new queue({ concurrency: 1 });
        const objQueueOnIdleSpy = jest.spyOn(objQueue, "onIdle");

        queueing.AddToQueue(DefaultObjectName, cb);

        await objQueue.onIdle();

        expect(objQueueOnIdleSpy).toHaveBeenCalled();
        expect(cb).toHaveBeenCalled();
        await queueing.namedQueuesIdle;
        expect(queueing.namedQueueActiveCount).toBe(0);
    });

    // named queue should be deleted when it becomes empty
    it("should delete named queue when it becomes empty", async () => {
        const queueing = new Queueing();
        queueing.AddToQueue(
            DefaultObjectName,
            jest.fn(() => Task())
        );
        await queueing.namedQueues.get(DefaultObjectName)!.onIdle();
        expect(queueing.namedQueues.has(DefaultObjectName)).toBe(false);
    });

    it("should handle adding tasks to multiple named queues in AddToQueue", async () => {
        const queueing = new Queueing();
        const task1 = jest.fn().mockResolvedValue(undefined);
        const task2 = jest.fn().mockResolvedValue(undefined);

        queueing.AddToQueue("object1", task1);
        queueing.AddToQueue("object2", task2);

        await queueing.namedQueues.get("object1")!.onIdle();
        await queueing.namedQueues.get("object2")!.onIdle();

        expect(task1).toHaveBeenCalled();
        expect(task2).toHaveBeenCalled();
    });

    it("should handle rapid addition of tasks to the same named queue", async () => {
        const queueing = new Queueing();
        const task1 = jest.fn().mockResolvedValue(undefined);
        const task2 = jest.fn().mockResolvedValue(undefined);

        queueing.AddToQueue(DefaultObjectName, task1);
        queueing.AddToQueue(DefaultObjectName, task2);

        await queueing.namedQueues.get(DefaultObjectName)!.onIdle();

        expect(task1).toHaveBeenCalled();
        expect(task2).toHaveBeenCalled();
    });
});
