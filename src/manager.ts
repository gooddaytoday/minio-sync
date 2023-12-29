import { exists, unlink } from "fs-extra";
import queue from "p-queue";
import * as path from "path";
import Queueing from "./queueing";
import { IsFileEqual, Log, TObjItem } from "./utils";

export const enum ObjectEvent {
    Create,
    Delete,
}

export type TObjectsListener = (
    event: ObjectEvent,
    objectName: string
) => Promise<void>;

export interface IStorage {
    AddObjectsListener(cb: TObjectsListener): void;
    /** Object name => object data */
    Objects: Map<string, TObjItem>;
    UploadFile(objectName: string, filePath: string): Promise<void>;
    UpdateFile(objectName: string, filePath: string): Promise<void>;
    DeleteFile(objectName: string): Promise<void>;
    DownloadFile(objectName: string, saveFilePath: string): Promise<void>;
    RemoveBucket(): Promise<void>;
}

export interface IPermissions {
    Read: boolean;
    Write: boolean;
}

export interface IManager {
    UploadFile(objectName: string, filePath: string): void;
    UpdateFile(objectName: string, filePath: string): void;
    DeleteFile(objectName: string): void;
    Sync(): void;
}

export class Manager implements IManager {
    private rootPath: string;
    private storage: IStorage;
    private permissions: IPermissions;
    private queueing = new Queueing();
    private onStopWatchCb: (() => void) | undefined;
    private onResumeWatchCb: (() => void) | undefined;
    private onSyncEndCb: (() => void) | undefined;

    constructor(
        rootPath: string,
        storage: IStorage,
        permissions: IPermissions
    ) {
        this.rootPath = rootPath;
        this.storage = storage;
        this.permissions = permissions;
        void this.storage.AddObjectsListener(this.OnObjectEvent.bind(this));
    }

    public get GlobalQueue(): queue {
        return this.queueing["globalQueue"];
    }

    public get QueueMap(): Map<string, queue> {
        return this.queueing["queueMap"];
    }

    public UploadFile(objectName: string, filePath: string): void {
        if (!this.permissions.Write) {
            Log(`UploadFile ${filePath}: Write permission denied`);
        } else {
            this.queueing.AddToQueue(objectName, () =>
                this.storage.UploadFile(objectName, filePath)
            );
        }
    }

    public UpdateFile(objectName: string, filePath: string): void {
        if (!this.permissions.Write) {
            Log(`UpdateFile ${filePath}: Write permission denied`);
        } else {
            this.queueing.AddToQueue(objectName, () =>
                this.storage.UpdateFile(objectName, filePath)
            );
        }
    }

    public DeleteFile(objectName: string): void {
        if (!this.permissions.Write) {
            Log(`DeleteFile ${objectName}: Write permission denied`);
        } else {
            this.queueing.AddToQueue(objectName, () =>
                this.storage.DeleteFile(objectName)
            );
        }
    }

    public Sync(): void {
        if (!this.permissions.Read) {
            Log("Sync: Read permission denied");
            return;
        }
        this.queueing.AddToGlobalQueue(async () => {
            try {
                this.StopWatch();
                Log(" --- SYNC ---");
                try {
                    await this.DownloadObjects();
                } finally {
                    this.ResumeWatch();
                }
                if (this.onSyncEndCb) {
                    this.onSyncEndCb();
                }
            } catch (e) {
                console.error("Error while syncing", e);
                throw e;
            } finally {
                Log(" --- SYNC ENDED, Listening for changes --- \n\n");
            }
        });
    }

    public OnSyncEnd(cb: () => void): void {
        this.onSyncEndCb = cb;
    }

    public OnStopWatch(cb: () => void): void {
        this.onStopWatchCb = cb;
    }

    public OnResumeWatch(cb: () => void): void {
        this.onResumeWatchCb = cb;
    }

    private StopWatch(): void {
        if (this.onStopWatchCb) {
            this.onStopWatchCb();
        } else {
            throw new Error("StopWatch callback not set");
        }
    }

    private ResumeWatch(): void {
        if (this.onResumeWatchCb) {
            this.onResumeWatchCb();
        } else {
            throw new Error("ResumeWatch callback not set");
        }
    }

    private async OnObjectEvent(
        event: ObjectEvent,
        objectName: string
    ): Promise<void> {
        if (!this.permissions.Read) {
            Log("Sync: Read permission denied");
            return;
        }
        const fullPath = path.join(this.rootPath, objectName);
        switch (event) {
            case ObjectEvent.Create:
                await this.OnObjectAdd(objectName, fullPath);
                break;
            case ObjectEvent.Delete:
                await this.OnObjectDelete(objectName, fullPath);
                break;
            default:
                throw new Error("Unknown object event");
        }
    }

    private async OnObjectAdd(
        objectName: string,
        fullPath: string
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            this.queueing.AddToQueue(objectName, async () => {
                try {
                    const obj = this.storage.Objects.get(objectName);
                    if (!obj || !(await IsFileEqual(fullPath, obj))) {
                        await this.storage.DownloadFile(objectName, fullPath);
                    }
                    resolve();
                } catch (e) {
                    console.error("Error while downloading", e);
                    reject(e);
                    throw e;
                }
            });
        });
    }

    private async OnObjectDelete(
        objectName: string,
        fullPath: string
    ): Promise<void> {
        try {
            if (
                this.storage.Objects.has(objectName) &&
                (await exists(fullPath))
            ) {
                await unlink(fullPath);
            }
        } catch (e) {
            console.error("Error while deleting", e);
            throw e;
        }
    }

    private async DownloadObjects(): Promise<void> {
        const objects = this.storage.Objects;
        const downloads: Promise<void>[] = [];
        for (const [obj, objData] of objects) {
            const fullpath = path.join(this.rootPath, obj);
            if (!(await IsFileEqual(fullpath, objData))) {
                downloads.push(this.storage.DownloadFile(obj, fullpath));
            }
        }
        await Promise.all(downloads);
    }
}
