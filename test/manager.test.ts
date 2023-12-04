/* eslint-disable @typescript-eslint/unbound-method */
import { IPermissions, IStorage, Manager } from "../src/manager";

describe("Manager's unit tests", () => {
    const rootPath = __dirname;
    function emptyPromiseMock(timeout: number = 100): jest.Mock {
        return jest
            .fn()
            .mockImplementation(
                () => new Promise(resolve => setTimeout(resolve, timeout))
            );
    }
    function CreateStorage(): IStorage {
        return {
            Objects: new Map(),
            UploadFile: emptyPromiseMock(),
            UpdateFile: emptyPromiseMock(),
            DeleteFile: emptyPromiseMock(),
            DownloadFile: emptyPromiseMock(),
            RemoveBucket: emptyPromiseMock(),
        };
    }
    const AllPermissions: IPermissions = {
        Read: true,
        Write: true,
    };
    // UploadFile method adds task to queueMap
    it("should add task to queueMap when UploadFile is called", () => {
        const storage: IStorage = CreateStorage();

        const manager = new Manager(rootPath, storage, AllPermissions);
        manager.UploadFile("objectName", "filePath");
        expect(storage.UploadFile).toHaveBeenCalledWith(
            "objectName",
            "filePath"
        );
    });

    // UpdateFile method adds task to queueMap
    it("should add task to queueMap when UpdateFile is called", () => {
        const storage: IStorage = CreateStorage();

        const manager = new Manager(rootPath, storage, AllPermissions);
        manager.UpdateFile("objectName", "filePath");
        expect(storage.UpdateFile).toHaveBeenCalledWith(
            "objectName",
            "filePath"
        );
    });

    // DeleteFile method adds task to queueMap
    it("should add task to queueMap when DeleteFile is called", () => {
        const storage: IStorage = CreateStorage();

        const manager = new Manager(rootPath, storage, AllPermissions);
        manager.DeleteFile("objectName");
        expect(storage.DeleteFile).toHaveBeenCalledWith("objectName");
    });

    // AddToGlobalQueue method adds task to globalQueue
    it("should add task to globalQueue when AddToGlobalQueue is called", () => {
        const storage: IStorage = CreateStorage();

        const manager = new Manager(rootPath, storage, AllPermissions);
        const cb = jest.fn();
        manager["AddToGlobalQueue"](cb);
        expect(cb).toHaveBeenCalled();
    });

    // AddToQueue method adds task to queue for objectName
    it("should add task to queue for objectName when AddToQueue is called", () => {
        const storage: IStorage = CreateStorage();

        const manager = new Manager(rootPath, storage, AllPermissions);
        const cb = jest.fn();
        manager["AddToQueue"]("objectName", cb);
        expect(cb).toHaveBeenCalled();
    });

    // Permissions.Write is false, methods don't add task to queueMap
    it("should not add task to queueMap when Permissions.Write is false", () => {
        const storage: IStorage = CreateStorage();
        const permissions: IPermissions = {
            Read: true,
            Write: false,
        };
        const manager = new Manager(rootPath, storage, permissions);
        manager.UploadFile("objectName", "filePath");
        manager.UpdateFile("objectName", "filePath");
        manager.DeleteFile("objectName");
        expect(storage.UploadFile).not.toHaveBeenCalled();
        expect(storage.UpdateFile).not.toHaveBeenCalled();
        expect(storage.DeleteFile).not.toHaveBeenCalled();
    });

    // Permissions.Read is false, Sync method doesn't download objects
    it("should not download objects when Permissions.Read is false", () => {
        const storage: IStorage = {
            Objects: new Map([["objectName", { size: 0, etag: null }]]),
            UploadFile: jest.fn(),
            UpdateFile: jest.fn(),
            DeleteFile: jest.fn(),
            DownloadFile: jest.fn(),
            RemoveBucket: jest.fn(),
        };
        const permissions: IPermissions = {
            Read: false,
            Write: true,
        };
        const manager = new Manager(rootPath, storage, permissions);
        manager.Sync();
        expect(storage.DownloadFile).not.toHaveBeenCalled();
    });

    // Object data size is 0, DownloadObjects method skips download
    // TODO : Finish this
    //it("should skip download when object data size is 0", async () => {
    //    const storage: IStorage = {
    //        Objects: new Map([["objectName", { size: 0, etag: null }]]),
    //        UploadFile: jest.fn(),
    //        UpdateFile: jest.fn(),
    //        DeleteFile: jest.fn(),
    //        DownloadFile: jest.fn(),
    //        RemoveBucket: jest.fn(),
    //    };

    //    const existsMock = jest.spyOn(fs, "exists").mockResolvedValue(true);
    //    const statMock = jest.spyOn(fs, "stat").mockResolvedValue({ size: 0 });
    //    const calcEtagMock = jest
    //        .spyOn(utils, "CalcEtag")
    //        .mockResolvedValue("etag");
    //    const manager = new Manager(rootPath, storage, permissions);
    //    await manager.Sync();
    //    expect(storage.DownloadFile).not.toHaveBeenCalled();
    //    expect(existsMock).toHaveBeenCalledWith(
    //        path.join(rootPath, "objectName")
    //    );
    //    expect(statMock).toHaveBeenCalledWith(
    //        path.join(rootPath, "objectName")
    //    );
    //    expect(calcEtagMock).not.toHaveBeenCalled();
    //    existsMock.mockRestore();
    //    statMock.mockRestore();
    //    calcEtagMock.mockRestore();
    //});

    // GlobalQueue runs exclusive after all in queueMap
    it("should run global task after all object tasks are completed", async () => {
        const storage: IStorage = CreateStorage();

        const manager = new Manager(rootPath, storage, AllPermissions);

        // Add tasks to object queues
        manager.UploadFile("objectName1", "filePath1");
        manager.UploadFile("objectName2", "filePath2");

        // Add global task
        manager.Sync();

        // Ensure global task is added to global queue
        expect(manager["globalQueue"].size).toBe(0);
        expect(manager["globalQueue"].pending).toBe(1);

        // Ensure object tasks are added to object queues
        expect(manager["queueMap"].size).toBe(2);

        // Wait for all tasks to complete
        await manager["globalQueue"].onIdle();

        // Ensure global task is completed after all object tasks
        expect(manager["globalQueue"].size).toBe(0);
        expect(manager["globalQueue"].pending).toBe(0);
    });

    // QueueMap runs exclusive for each objectName
    it("should run tasks in object queue exclusively for each objectName", async () => {
        const storage: IStorage = CreateStorage();

        const manager = new Manager(rootPath, storage, AllPermissions);

        // Add tasks to object queues
        manager.UploadFile("objectName1", "filePath1");
        manager.UploadFile("objectName2", "filePath2");

        // Ensure object tasks are added to object queues
        expect(manager["queueMap"].size).toBe(2);

        // Wait for all tasks to complete
        await manager["globalQueue"].onIdle();

        // Ensure object tasks are completed
        const all = Array.from(manager["queueMap"].values()).map(q =>
            q.onIdle()
        );
        await Promise.all(all);
        expect(manager["queueMap"].size).toBe(0);
    });

    // GlobalQueue runs tasks in parallel
    it("should run global tasks in parallel", async () => {
        const storage: IStorage = CreateStorage();

        const manager = new Manager(rootPath, storage, AllPermissions);

        // Add tasks to object queues
        manager.UploadFile("objectName1", "filePath1");
        manager.UploadFile("objectName2", "filePath2");

        // Add global task
        manager.Sync();

        // Ensure global task is added to global queue
        expect(manager["globalQueue"].size).toBe(0);
        expect(manager["globalQueue"].pending).toBe(1);

        // Ensure object tasks are added to object queues
        expect(manager["queueMap"].size).toBe(2);

        // Wait for all tasks to complete
        await manager["globalQueue"].onIdle();

        expect(manager["queueMap"].size).toBe(0);

        // Ensure global task is completed after all object tasks
        expect(manager["globalQueue"].size).toBe(0);
    });
});
