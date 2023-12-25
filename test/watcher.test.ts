/* eslint-disable @typescript-eslint/unbound-method */
import { unlinkSync } from "fs";
import { copyFileSync } from "fs-extra";
import path from "path";
import { IPermissions, Manager as ManagerClass } from "../src/manager";
import * as utils from "../src/utils";
import { Watcher } from "../src/watcher";
import { ManagerWrapper } from "./ManagerWrapper";
import { testsCommon } from "./testsCommon";

describe("Watcher", () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    const CreateStorage = testsCommon.CreateStorage;

    const rootPath = __dirname;
    const DefaultObjectName = "example.txt";
    const AllPermissions: IPermissions = {
        Read: true,
        Write: true,
    };

    function Init(permissions: IPermissions = AllPermissions): {
        manager: ManagerWrapper;
        watcher: Watcher;
    } {
        // Mock Manager
        const manager = new ManagerWrapper(
            rootPath,
            CreateStorage(),
            permissions
        );
        const watcher = new Watcher(
            rootPath,
            manager as unknown as ManagerClass
        );
        return { manager: manager, watcher: watcher };
    }

    // Watcher can be instantiated with a root path and a Manager instance
    it("should instantiate Watcher with root path and Manager instance", () => {
        const { manager, watcher } = Init();
        expect(watcher["rootPath"]).toBe(rootPath);
        expect(watcher["manager"]).toBe(manager);
    });

    // On 'add' event, Watcher uploads the file to the Manager
    it("should upload the file to the Manager when an 'add' event occurs", async () => {
        const { manager, watcher } = Init();
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
        const { manager, watcher } = Init();
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
    it("should delete the file from the Manager when an 'unlink' event occurs", () => {
        const { manager, watcher } = Init();
        // Trigger 'unlink' event
        watcher["OnUnlink"](DefaultObjectName);
        // Assert that DeleteFile method of Manager is called with the correct arguments
        expect(manager.storage.DeleteFile).toHaveBeenCalledWith(
            DefaultObjectName
        );
    });

    // Manager.AddObjectsListener() throws an error
    it("should log an error when Manager.AddObjectsListener() throws an error", () => {
        const { watcher } = Init({
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

    // StopWatch stops watching rootPath and ResumeWatch resumes watching rootPath
    it("should stop watching rootPath when StopWatch is called and resume watching rootPath when ResumeWatch is called", async () => {
        const { manager, watcher } = Init();
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
            await new Promise(resolve => setTimeout(resolve, 100));
            const queue = manager.GetQueue(objectName);
            if (!queue) throw new Error(`Queue for ${newFileName} not found`);
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
});
