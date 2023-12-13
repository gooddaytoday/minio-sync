import queue from "p-queue";
import QueueingClass from "../src/queueing";
import { testsCommon } from "./testsCommon";

const Task = testsCommon.Task;

class Queueing {
    private queueing = new QueueingClass();
    constructor() {}

    public get queueMapActiveCount(): number {
        return this.queueing["queueMapActiveCount"];
    }

    public get globalQueue(): queue {
        return this.queueing["globalQueue"];
    }

    public get queueMap(): Map<string, queue> {
        return this.queueing["queueMap"];
    }

    public get queueMapIdle(): Promise<void[]> {
        return Promise.all(
            Array.from(this.queueMap.values()).map(q => q.onIdle())
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

        queueing.queueMap.set(DefaultObjectName, new queue({ concurrency: 1 }));

        expect(() => {
            queueing.AddToQueue(DefaultObjectName, cb);
        }).not.toThrow();
        expect(cb).toHaveBeenCalled();
    });

    // Adds cb to global queue if queueMap is empty
    it("should add cb to global queue if queueMap is empty", () => {
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
        expect(queueing.queueMap.has(DefaultObjectName)).toBe(true);
        expect(queueing.queueMap.get(DefaultObjectName)).toBeInstanceOf(queue);
        expect(queueing.queueMap.get(DefaultObjectName)?.size).toBe(0);
        expect(queueing.queueMap.get(DefaultObjectName)?.pending).toBe(1);

        // Wait for the global queue to become idle
        await queueing.globalQueue.onIdle();

        // Wait for the task of objectName to be executed
        await queueing.queueMap.get(DefaultObjectName)?.onIdle();

        // Check that the task in the object queue has been executed
        // by checking that the object queue is empty
        expect(queueing.queueMap.has(DefaultObjectName)).toBe(false);

        // Check the sequence of tasks
        expect(sequenceResult).toEqual(["global", "objectQueue"]);
    });

    // If globalQueue is not empty, AddToQueue runs cb after all in queueMap and globalQueue
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

        const queueMapGetSpy = jest.spyOn(queueing["queueMap"], "get");
        const globalQueueSizeSpy = jest.spyOn(
            queueing["globalQueue"],
            "size",
            "get"
        );
        const globalQueuePendingSpy = jest.spyOn(
            queueing["globalQueue"],
            "pending",
            "get"
        );
        const globalQueueOnIdleSpy = jest.spyOn(
            queueing["globalQueue"],
            "onIdle"
        );

        queueing.AddToGlobalQueue(() => Task(globalCbTask));
        queueing.AddToQueue(objectName, () => Task(objectTask));

        expect(queueMapGetSpy).toHaveBeenCalledWith(objectName);
        expect(globalQueueSizeSpy).toHaveBeenCalled();
        expect(globalQueuePendingSpy).toHaveBeenCalled();
        expect(globalQueueOnIdleSpy).toHaveBeenCalled();

        await queueing["globalQueue"].onIdle();
        expect(globalCbTask).toHaveBeenCalled();
        expect(sequenceResult).toEqual(["global"]);

        await queueing["queueMap"].get(objectName)!.onIdle();
        expect(objectTask).toHaveBeenCalled();
        expect(sequenceResult).toEqual(["global", "objectQueue"]);
    });

    // Adds cb to global queue after all in queueMap if queueMap is not empty
    it("should rename queue for objectName when there is a queue for objectName and globalQueue is not empty", async () => {
        const queueing = new Queueing();
        type TResults = "global" | "firstTask" | "lastTask";
        const sequenceResult: TResults[] = [];
        // Add a task to queueMap
        const firstObjTask = jest.fn(() => sequenceResult.push("firstTask"));
        queueing.AddToQueue(DefaultObjectName, () => Task(firstObjTask));

        // Add a task to global queue
        const globalTask = jest.fn(() => sequenceResult.push("global"));
        queueing.AddToGlobalQueue(() => Task(globalTask));

        // Add second task to queueMap
        const lastObjTask = jest.fn(() => sequenceResult.push("lastTask"));
        queueing.AddToQueue(DefaultObjectName, () => Task(lastObjTask));

        // Assert
        expect(queueing.globalQueue.size).toBe(0);
        expect(queueing.globalQueue.pending).toBe(1);

        // Wait for the tasks to be executed
        await queueing.globalQueue.onIdle();
        expect(sequenceResult).toEqual(["firstTask", "global"]);
        expect(queueing.globalQueue.size).toBe(0);
        expect(queueing.globalQueue.pending).toBe(0);
        expect(queueing.queueMap.size).toBe(2);

        // wait for all object' tasks in queueMap to be executed
        await queueing.queueMapIdle;
        expect(queueing.queueMap.size).toBe(0);
        expect(sequenceResult).toEqual(["firstTask", "global", "lastTask"]);
    });

    it("should decrement queueMapActiveCount when a queue becomes empty", async () => {
        const queueing = new Queueing();
        const cb = jest.fn(() => Task());
        const objQueue = new queue({ concurrency: 1 });
        const objQueueOnIdleSpy = jest.spyOn(objQueue, "onIdle");

        queueing.AddToQueue(DefaultObjectName, cb);

        await objQueue.onIdle();

        expect(objQueueOnIdleSpy).toHaveBeenCalled();
        expect(cb).toHaveBeenCalled();
        await queueing.queueMapIdle;
        expect(queueing.queueMapActiveCount).toBe(0);
    });
});
