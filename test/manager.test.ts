/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable @typescript-eslint/unbound-method */
import fsExtra from "fs-extra";
import queue from "p-queue";
import path from "path";
import { IPermissions, IStorage, Manager, ObjectEvent } from "../src/manager";
import * as utils from "../src/utils";

describe("Manager's unit tests", () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    const rootPath = __dirname;
    function emptyPromiseMock(timeout: number = 100): jest.Mock {
        return jest.fn(
            () => new Promise(resolve => setTimeout(resolve, timeout))
        );
    }

    const DefaultObjectName = "example.txt";
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
    function CreateStorage(
        objects: Map<string, utils.TObjItem> = new Map()
    ): IStorage {
        return {
            AddObjectsListener: jest.fn(),
            Objects: objects,
            GetObject: function (objectName: string) {
                return this.Objects.get(objectName);
            },
            HasObject: function (objectName: string) {
                return this.Objects.has(objectName);
            },
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
    // UploadFile method adds task to NamedQueues
    it("should add task to NamedQueues when UploadFile is called", () => {
        const storage: IStorage = CreateStorage();

        const manager = new Manager(rootPath, storage, AllPermissions);
        manager.UploadFile("objectName", "filePath");
        expect(storage.UploadFile).toHaveBeenCalledWith(
            "objectName",
            "filePath"
        );
    });

    // UpdateFile method adds task to NamedQueues
    it("should add task to NamedQueues when UpdateFile is called", () => {
        const storage: IStorage = CreateStorage();

        const manager = new Manager(rootPath, storage, AllPermissions);
        manager.UpdateFile("objectName", "filePath");
        expect(storage.UpdateFile).toHaveBeenCalledWith(
            "objectName",
            "filePath"
        );
    });

    // DeleteFile method adds task to NamedQueues
    it("should add task to NamedQueues when DeleteFile is called", () => {
        const storage: IStorage = CreateStorage();

        const manager = new Manager(rootPath, storage, AllPermissions);
        manager.DeleteFile("objectName");
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
            GetObject: jest.fn(),
            HasObject: jest.fn(),
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

    function GlobalQueue(manager: Manager): queue {
        return manager["queueing"]["globalQueue"];
    }

    function NamedQueues(manager: Manager): Map<string, queue> {
        return manager["queueing"]["namedQueues"];
    }

    // NamedQueues runs exclusive for each objectName
    it("should run tasks in object queue exclusively for each objectName", async () => {
        const storage: IStorage = CreateStorage();

        const manager = new Manager(rootPath, storage, AllPermissions);

        // Add tasks to object queues
        manager.UploadFile("objectName1", "filePath1");
        manager.UploadFile("objectName2", "filePath2");

        // Ensure object tasks are added to object queues
        expect(NamedQueues(manager).size).toBe(2);

        // Wait for all tasks to complete
        await GlobalQueue(manager).onIdle();

        // Ensure object tasks are completed
        const all = Array.from(NamedQueues(manager).values()).map(q =>
            q.onIdle()
        );
        await Promise.all(all);
        expect(NamedQueues(manager).size).toBe(0);
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
        const storage: IStorage = CreateStorage();

        const manager = new Manager(rootPath, storage, AllPermissions);
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

    it("should call onSyncEndCb when it is set and Sync is called", async () => {
        const storage: IStorage = CreateStorage();
        const manager = new Manager(rootPath, storage, AllPermissions);

        const onSyncEndCbMock = jest.fn();
        manager.OnSyncEnd(onSyncEndCbMock);

        manager.Sync();

        // Ожидаем завершения всех задач в глобальной очереди
        await GlobalQueue(manager).onIdle();

        expect(onSyncEndCbMock).toHaveBeenCalled();
    });
});
