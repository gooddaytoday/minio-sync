/* eslint-disable @typescript-eslint/unbound-method */
import { copyFileSync, unlinkSync } from "fs";
import path from "path";
import * as utils from "../src/utils";
import { testsCommon } from "./testsCommon";

describe("Watcher", () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    const rootPath = __dirname;
    const { Init, DefaultObjectName } = testsCommon;

    // Watcher can be instantiated with a root path and a Manager instance
    it("should instantiate Watcher with root path and Manager instance", async () => {
        const { manager, watcher } = await Init(rootPath);
        expect(watcher["rootPath"]).toBe(rootPath);
        expect(watcher["manager"]).toBe(manager);
    });

    // On 'add' event, Watcher uploads the file to the Manager
    it("should upload the file to the Manager when an 'add' event occurs", async () => {
        const { manager, watcher } = await Init(rootPath);
        // Trigger 'add' event
        watcher["OnAdd"](DefaultObjectName);
        const queue = manager.GetQueue(DefaultObjectName);
        await queue?.onIdle();
        // Assert that UploadFile method of Storage is called with the correct arguments
        expect(manager.storage.UploadFile).toHaveBeenCalledWith(
            DefaultObjectName,
            DefaultObjectName
        );
    });

    // On 'change' event, Watcher updates the file in the Manager
    it("should update the file in the Manager when a 'change' event occurs", async () => {
        const { manager, watcher } = await Init(rootPath);
        // Trigger 'change' event
        watcher["OnChange"](DefaultObjectName);
        const queue = manager.GetQueue(DefaultObjectName);
        await queue?.onIdle();
        // Assert that UpdateFile method of Manager is called with the correct arguments
        expect(manager.storage.UpdateFile).toHaveBeenCalledWith(
            DefaultObjectName,
            DefaultObjectName
        );
    });

    // On 'unlink' event, Watcher deletes the file from the Manager
    it("should delete the file from the Manager when an 'unlink' event occurs", async () => {
        const { manager, watcher } = await Init(rootPath);
        // Trigger 'unlink' event
        watcher["OnUnlink"](DefaultObjectName);
        await manager.AllQueues();
        // Assert that DeleteFile method of Manager is called with the correct arguments
        expect(manager.storage.DeleteFile).toHaveBeenCalledWith(
            DefaultObjectName
        );
    });

    // Manager.AddObjectsListener() throws an error
    it("should log an error when Manager.AddObjectsListener() throws an error", async () => {
        const { watcher } = await Init(rootPath, {
            Read: true,
            Write: false,
        });
        // Mock Log function
        const logMock = jest.spyOn(utils, "Log");
        // Call the relevant Watcher method
        watcher["OnAdd"](DefaultObjectName);
        // Assert that the error is logged
        expect(logMock).toHaveBeenCalledWith(
            `UploadFile ${DefaultObjectName}: Write permission denied`
        );
    });

    describe("StopWatch and ResumeWatch", () => {
        // StopWatch stops watching rootPath and ResumeWatch resumes watching rootPath
        it.only("should stop watching rootPath when StopWatch is called and resume watching rootPath when ResumeWatch is called", async () => {
            const { manager, watcher } = await Init(
                rootPath,
                testsCommon.AllPermissions,
                {
                    ignoreInitial: true,
                }
            );
            const newFileName = utils.GUID();
            const objectName = `/${newFileName}`;
            const newFilePath = path.join(rootPath, newFileName);

            // Spy on watcher.unwatch function
            const unwatchMock = jest.spyOn(watcher["watcher"], "unwatch");
            const watchMock = jest.spyOn(watcher["watcher"], "add");

            // Call StopWatch method
            watcher.StopWatch();

            // Assert that unwatch method of FSWatcher is called with the rootPath
            expect(unwatchMock).toHaveBeenCalledWith(rootPath);

            // Copy file to add to queue
            copyFileSync(__filename, newFilePath);

            try {
                // Check that UploadFile was not called
                expect(manager.storage.UploadFile).not.toHaveBeenCalled();

                // Remove copied file
                unlinkSync(newFilePath);

                // Call ResumeWatch method
                watcher.ResumeWatch();

                // Assert that add method of FSWatcher is called with the rootPath
                expect(watchMock).toHaveBeenCalledWith(rootPath);

                // Try to copy and check that UploadFile was called
                copyFileSync(__filename, newFilePath);

                // wait 300 msec
                await new Promise(resolve => setTimeout(resolve, 300));

                const queue = manager.GetQueue(objectName);
                if (!queue)
                    throw new Error(`Queue for ${newFileName} not found`);
                await queue.onIdle();
                expect(manager.storage.UploadFile).toHaveBeenCalled();
                expect(manager.storage.UploadFile).toHaveBeenCalledWith(
                    objectName,
                    newFilePath
                );
            } finally {
                // Delete copied file
                unlinkSync(newFilePath);
            }
        });

        // When stopWatchCount is greater than 0, StopWatch increments stopWatchCount
        it("should increment stopWatchCount when stopWatchCount is greater than 0", async () => {
            const { watcher } = await Init(rootPath);
            const unwatchMock = jest.spyOn(watcher["watcher"], "unwatch");

            watcher.StopWatch();
            watcher.StopWatch();

            expect(unwatchMock).toHaveBeenCalledTimes(1);
            expect(watcher["stopWatchCount"]).toBe(2);
        });

        // When StopWatch is called with stopWatchCount greater than 0, StopWatch does not call unwatch method of FSWatcher
        it("should not call unwatch method of FSWatcher when stopWatchCount is greater than 0", async () => {
            const { watcher } = await Init(rootPath);
            const unwatchMock = jest.spyOn(watcher["watcher"], "unwatch");

            watcher.StopWatch();
            watcher.StopWatch();

            expect(unwatchMock).toHaveBeenCalledTimes(1);
        });

        // When StopWatch is called with stopWatchCount equal to 0, StopWatch increments stopWatchCount and does not call unwatch method of FSWatcher
        it("should increment stopWatchCount and not call unwatch method of FSWatcher when stopWatchCount is equal to 0", async () => {
            const { watcher } = await Init(rootPath);
            const unwatchMock = jest.spyOn(watcher["watcher"], "unwatch");

            watcher.StopWatch();

            expect(unwatchMock).toHaveBeenCalledTimes(1);
            expect(watcher["stopWatchCount"]).toBe(1);
        });

        it("should decrement stopWatchCount and call add method of FSWatcher when stopWatchCount is equal to 1", async () => {
            const { watcher } = await Init(rootPath);
            const addSpy = jest.spyOn(watcher["watcher"], "add");
            watcher.StopWatch();
            watcher.ResumeWatch();
            expect(watcher["stopWatchCount"]).toBe(0);
            expect(addSpy).toHaveBeenCalledWith(rootPath);
        });

        it("should decrement stopWatchCount and not call add method of FSWatcher when stopWatchCount is greater than 1", async () => {
            const { watcher } = await Init(rootPath);
            const addSpy = jest.spyOn(watcher["watcher"], "add");
            watcher.StopWatch();
            watcher.StopWatch();
            watcher.ResumeWatch();
            expect(watcher["stopWatchCount"]).toBe(1);
            expect(addSpy).not.toHaveBeenCalled();
        });

        it("should throw an error when stopWatchCount is equal to 0", async () => {
            const { watcher } = await Init(rootPath);
            expect(() => {
                watcher.ResumeWatch();
            }).toThrow("Watcher is not stopped");
        });

        it("stopWatchCount should be equal to 0 and call add method of FSWatcher when StopWatch and ResumeWatch are called twice", async () => {
            const { watcher } = await Init(rootPath);
            const addSpy = jest.spyOn(watcher["watcher"], "add");
            watcher.StopWatch();
            watcher.StopWatch();
            watcher.ResumeWatch();
            watcher.ResumeWatch();
            expect(watcher["stopWatchCount"]).toBe(0);
            expect(addSpy).toHaveBeenCalledTimes(1);
        });
    });
});
