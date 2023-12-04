import { exists, stat } from "fs-extra";
import queue from "p-queue";
import * as path from "path";
import { CalcEtag, Log } from "./utils";

type TObjItem = {
    size: number;
    etag: string | null;
};

export interface IStorage {
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

interface IManager {
    UploadFile(objectName: string, filePath: string): void;
    UpdateFile(objectName: string, filePath: string): void;
    DeleteFile(objectName: string): void;
    Sync(): void;
}

export class Manager implements IManager {
    private rootPath: string;
    private storage: IStorage;
    private permissions: IPermissions;
    private globalQueue: queue = new queue({ concurrency: 1 });
    private queueMap = new Map<string, queue>();

    constructor(
        rootPath: string,
        storage: IStorage,
        permissions: IPermissions
    ) {
        this.rootPath = rootPath;
        this.storage = storage;
        this.permissions = permissions;
    }

    public UploadFile(objectName: string, filePath: string): void {
        if (!this.permissions.Write) {
            Log(`UploadFile ${filePath}: Write permission denied`);
        } else {
            this.AddToQueue(objectName, () =>
                this.storage.UploadFile(objectName, filePath)
            );
        }
    }

    public UpdateFile(objectName: string, filePath: string): void {
        if (!this.permissions.Write) {
            Log(`UpdateFile ${filePath}: Write permission denied`);
        } else {
            this.AddToQueue(objectName, () =>
                this.storage.UpdateFile(objectName, filePath)
            );
        }
    }

    public DeleteFile(objectName: string): void {
        if (!this.permissions.Write) {
            Log(`DeleteFile ${objectName}: Write permission denied`);
        } else {
            this.AddToQueue(objectName, () =>
                this.storage.DeleteFile(objectName)
            );
        }
    }

    public Sync(): void {
        if (!this.permissions.Read) {
            Log("Sync: Read permission denied");
            return;
        }
        this.AddToGlobalQueue(async () => {
            try {
                Log(" --- SYNC ---");
                await this.DownloadObjects();
            } catch (e) {
                console.error("Error while syncing", e);
                throw e;
            } finally {
                Log(" --- SYNC ENDED ---");
            }
        });
    }

    private async DownloadObjects(): Promise<void> {
        const objects = this.storage.Objects;
        const downloads: Promise<void>[] = [];
        for (const [obj, objData] of objects) {
            const fullpath = path.join(this.rootPath, obj);
            if (await exists(fullpath)) {
                const fileStat = await stat(fullpath);
                if (
                    (objData.size == 0 && fileStat.size == 0) ||
                    (objData.size == fileStat.size &&
                        objData.etag === (await CalcEtag(fullpath)))
                ) {
                    continue;
                }
            }
            downloads.push(this.storage.DownloadFile(obj, fullpath));
        }
        await Promise.all(downloads);
    }

    /** Adds cb to global queue that run exclusive after all in queueMap */
    private AddToGlobalQueue(cb: () => Promise<void>): void {
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

    /** Adds cb to queue for objectName */
    private AddToQueue(objectName: string, cb: () => Promise<void>): void {
        if (this.globalQueue.size > 0) {
            const newTask = this.globalQueue.onIdle().then(cb);
            cb = () => newTask;
        }
        let objQueue = this.queueMap.get(objectName);
        if (!objQueue) {
            objQueue = new queue({ concurrency: 1 });
            this.queueMap.set(objectName, objQueue);
        }
        objQueue.add(cb).catch(e => {
            console.error(`Error in queue of object ${objectName}`, e);
            throw e;
        });
        void objQueue.onIdle().finally(() => {
            this.queueMap.delete(objectName);
        });
    }
}
