/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable @typescript-eslint/unbound-method */
import fsExtra from "fs-extra";
import path from "path";
import { IPermissions, IStorage, Manager, ObjectEvent } from "../src/manager";
import * as utils from "../src/utils";
import { testsCommon } from "./testsCommon";

describe("Manager's unit tests", () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    const { Init, rootPath, DefaultObjectName } = testsCommon;
    const DefaultFullPath = path.join(rootPath, DefaultObjectName);
    const MapWithObject = new Map([
        [
            DefaultObjectName,
            {
                size: 1024,
                etag: "123e4567-e89b-12d3-a456-426655440000",
            },
        ],
    ]);
    const CreateStorage = testsCommon.CreateStorage;
    const AllPermissions: IPermissions = {
        Read: true,
        Write: true,
    };
    // UploadFile method adds task to queueMap
    it("should add task to queueMap when UploadFile is called", async () => {
        const { storage, manager } = await Init();
        manager.UploadFile("objectName", "filePath");
        await manager.AllQueues();
        expect(storage.UploadFile).toHaveBeenCalledWith(
            "objectName",
            "filePath"
        );
    });

    // UpdateFile method adds task to queueMap
    it("should add task to queueMap when UpdateFile is called", async () => {
        const { storage, manager } = await Init();
        manager.UpdateFile("objectName", "filePath");
        await manager.AllQueues();
        expect(storage.UpdateFile).toHaveBeenCalledWith(
            "objectName",
            "filePath"
        );
    });

    // DeleteFile method adds task to queueMap
    it("should add task to queueMap when DeleteFile is called", async () => {
        const { storage, manager } = await Init();
        manager.DeleteFile("objectName");
        await manager.AllQueues();
        expect(storage.DeleteFile).toHaveBeenCalledWith("objectName");
    });

    it("should not upload, update or delete when Permissions.Write is false", () => {
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
            AddObjectsListener: jest.fn(),
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
        const manager = new Manager(rootPath, CreateStorage(), AllPermissions);
        const stopWatchMock = jest.fn();
        manager.OnStopWatch(stopWatchMock);
        const resumeWatchMock = jest.fn();
        manager.OnResumeWatch(resumeWatchMock);

        // Add tasks to object queues
        manager.UploadFile("objectName1", "filePath1");
        manager.UploadFile("objectName2", "filePath2");

        // Add global task
        manager.Sync();

        // Ensure global task is added to global queue
        expect(manager.GlobalQueue.size).toBe(0);
        expect(manager.GlobalQueue.pending).toBe(1);

        // Ensure object tasks are added to object queues
        expect(manager.QueueMap.size).toBe(2);

        // Wait for all tasks to complete
        await manager.GlobalQueue.onIdle();

        expect(stopWatchMock).toHaveBeenCalled();
        expect(resumeWatchMock).toHaveBeenCalled();

        // Ensure global task is completed after all object tasks
        expect(manager.GlobalQueue.size).toBe(0);
        expect(manager.GlobalQueue.pending).toBe(0);
    });

    // QueueMap runs exclusive for each objectName
    it("should run tasks in object queue exclusively for each objectName", async () => {
        const { manager } = await Init();

        // Add tasks to object queues
        manager.UploadFile("objectName1", "filePath1");
        manager.UploadFile("objectName2", "filePath2");

        // Ensure object tasks are added to object queues
        expect(manager.QueueMap.size).toBe(2);

        // Wait for all tasks to complete
        await manager.GlobalQueue.onIdle();

        expect(manager.QueueMap.size).toBe(2);
        expect(manager.GlobalQueue.size).toBe(0);

        // Ensure object tasks are completed
        const all = Array.from(manager.QueueMap.values()).map(q => q.onIdle());
        await Promise.all(all);
        expect(manager.QueueMap.size).toBe(0);
    });

    // GlobalQueue runs tasks in parallel
    it("should run global tasks in parallel", async () => {
        const manager = new Manager(rootPath, CreateStorage(), AllPermissions);
        const stopWatchMock = jest.fn();
        manager.OnStopWatch(stopWatchMock);
        const resumeWatchMock = jest.fn();
        manager.OnResumeWatch(resumeWatchMock);

        // Add tasks to object queues
        manager.UploadFile("objectName1", "filePath1");
        manager.UploadFile("objectName2", "filePath2");

        // Add global task
        manager.Sync();

        // Ensure global task is added to global queue
        expect(manager.GlobalQueue.size).toBe(0);
        expect(manager.GlobalQueue.pending).toBe(1);

        // Ensure object tasks are added to object queues
        expect(manager.QueueMap.size).toBe(2);

        // Wait for all tasks to complete
        await manager.GlobalQueue.onIdle();

        expect(stopWatchMock).toHaveBeenCalled();
        expect(resumeWatchMock).toHaveBeenCalled();

        // Ensure object tasks are completed
        expect(manager.QueueMap.size).toBe(0);

        // Ensure global task is completed after all object tasks
        expect(manager.GlobalQueue.size).toBe(0);
    });

    it("should delete a file when it exists locally", async () => {
        const storage: IStorage = CreateStorage(MapWithObject);
        const manager = new Manager(rootPath, storage, AllPermissions);
        const existsMock = jest
            .spyOn(fsExtra, "exists")
            .mockImplementation(() => Promise.resolve(true));
        const unlinkMock = jest
            .spyOn(fsExtra, "unlink")
            .mockImplementation(() => Promise.resolve());

        await manager["OnObjectEvent"](ObjectEvent.Delete, DefaultObjectName);
        expect(existsMock).toHaveBeenCalledWith(DefaultFullPath);
        expect(unlinkMock).toHaveBeenCalledWith(DefaultFullPath);

        existsMock.mockRestore();
        unlinkMock.mockRestore();
    });

    it("should download a file when it is not exists in local storage's objects", async () => {
        const { storage, manager } = await Init();
        const mockDownloadFile = jest
            .spyOn(storage, "DownloadFile")
            .mockResolvedValue();

        await manager["OnObjectEvent"](ObjectEvent.Create, DefaultObjectName);
        expect(mockDownloadFile).toHaveBeenCalledWith(
            DefaultObjectName,
            DefaultFullPath
        );
    });

    it("should download a file when it is exists in local storage's objects and does not exist locally", async () => {
        const storage: IStorage = CreateStorage(MapWithObject);

        const manager = new Manager(rootPath, storage, AllPermissions);
        const mockIsFileEqual = jest
            .spyOn(utils, "IsFileEqual")
            .mockResolvedValue(false);
        const mockDownloadFile = jest
            .spyOn(storage, "DownloadFile")
            .mockResolvedValue();

        await manager["OnObjectEvent"](ObjectEvent.Create, DefaultObjectName);

        expect(mockIsFileEqual).toHaveBeenCalledWith(
            DefaultFullPath,
            expect.anything()
        );
        expect(mockDownloadFile).toHaveBeenCalledWith(
            DefaultObjectName,
            DefaultFullPath
        );

        mockIsFileEqual.mockRestore();
        mockDownloadFile.mockRestore();
    });

    it("should not download a file when it is created but already exists locally", async () => {
        const storage: IStorage = CreateStorage(MapWithObject);

        const manager = new Manager(rootPath, storage, AllPermissions);
        const mockIsFileEqual = jest
            .spyOn(utils, "IsFileEqual")
            .mockResolvedValue(true);
        const mockDownloadFile = jest
            .spyOn(storage, "DownloadFile")
            .mockResolvedValue();

        await manager["OnObjectEvent"](ObjectEvent.Create, DefaultObjectName);

        expect(mockIsFileEqual).toHaveBeenCalledWith(
            DefaultFullPath,
            expect.anything()
        );
        expect(mockDownloadFile).not.toHaveBeenCalled();

        mockIsFileEqual.mockRestore();
        mockDownloadFile.mockRestore();
    });
});
