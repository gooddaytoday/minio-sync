import { exists, unlink } from "fs-extra";
import * as path from "path";
import Queueing from "./queueing";
import { IsFileEqual, IsIgnoredPath, Log, TObjItem } from "./utils";

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
    HasObject(objectName: string): boolean;
    GetObject(objectName: string): TObjItem | undefined;
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
    private queueing = new Queueing();
    /** Execute upload/download in parallel for separate files or in one global queue */
    private parallel: boolean;
    private onSyncEndCb: (() => void) | undefined;

    constructor(
        rootPath: string,
        storage: IStorage,
        permissions: IPermissions,
        parallel: boolean = true
    ) {
        this.rootPath = rootPath;
        this.storage = storage;
        this.permissions = permissions;
        this.parallel = parallel;
        void this.storage.AddObjectsListener(this.OnObjectEvent.bind(this));
    }

    public UploadFile(objectName: string, filePath: string): void {
        if (!this.permissions.Write) {
            Log(`UploadFile ${filePath}: Write permission denied`);
        } else {
            if (IsIgnoredPath(filePath)) return;
            const cb = () => this.storage.UploadFile(objectName, filePath);
            if (this.parallel) {
                this.queueing.AddToQueue(objectName, cb);
            } else {
                this.queueing.AddToGlobalQueue(cb);
            }
        }
    }

    public UpdateFile(objectName: string, filePath: string): void {
        if (!this.permissions.Write) {
            Log(`UpdateFile ${filePath}: Write permission denied`);
        } else {
            if (IsIgnoredPath(filePath)) return;
            const cb = () => this.storage.UpdateFile(objectName, filePath);
            if (this.parallel) {
                this.queueing.AddToQueue(objectName, cb);
            } else {
                this.queueing.AddToGlobalQueue(cb);
            }
        }
    }

    public DeleteFile(objectName: string): void {
        if (!this.permissions.Write) {
            Log(`DeleteFile ${objectName}: Write permission denied`);
        } else {
            if (IsIgnoredPath(objectName)) return;
            const cb = () => this.storage.DeleteFile(objectName);
            if (this.parallel) {
                this.queueing.AddToQueue(objectName, cb);
            } else {
                this.queueing.AddToGlobalQueue(cb);
            }
        }
    }

    public Sync(): void {
        this.queueing.AddToGlobalQueue(async () => {
            try {
                Log(" --- SYNC ---");
                if (this.permissions.Read) {
                    await this.DownloadObjects();
                }
            } catch (e) {
                console.error("Error while syncing", e);
                throw e;
            } finally {
                Log(" --- SYNC ENDED, Listening for changes --- \n\n");
                if (this.onSyncEndCb) {
                    this.onSyncEndCb();
                }
            }
        });
    }

    public OnSyncEnd(cb: () => void): void {
        this.onSyncEndCb = cb;
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
                if (IsIgnoredPath(fullPath)) return;
                return new Promise((resolve, reject) => {
                    const cb = async () => {
                        try {
                            const obj = this.storage.GetObject(objectName);
                            if (!obj || !(await IsFileEqual(fullPath, obj))) {
                                await this.storage.DownloadFile(
                                    objectName,
                                    fullPath
                                );
                            }
                            resolve();
                        } catch (e) {
                            console.error("Error while downloading", e);
                            reject(e);
                            throw e;
                        }
                    };
                    if (this.parallel) {
                        this.queueing.AddToQueue(objectName, cb);
                    } else {
                        this.queueing.AddToGlobalQueue(cb);
                    }
                });
            case ObjectEvent.Delete:
                if (IsIgnoredPath(fullPath)) return;
                try {
                    if (
                        this.storage.HasObject(objectName) &&
                        (await exists(fullPath))
                    ) {
                        await unlink(fullPath);
                    }
                } catch (e) {
                    console.error("Error while deleting", e);
                    throw e;
                }
                break;
            default:
                throw new Error(`Unknown object event: ${event}`);
        }
    }

    private async DownloadObjects(): Promise<void> {
        const objects = this.storage.Objects;
        const downloads: Promise<void>[] = [];
        for (const [obj, objData] of objects) {
            const fullpath = path.join(this.rootPath, obj);
            if (
                !IsIgnoredPath(fullpath) &&
                !(await IsFileEqual(fullpath, objData))
            ) {
                if (this.parallel) {
                    downloads.push(this.storage.DownloadFile(obj, fullpath));
                } else {
                    await this.storage.DownloadFile(obj, fullpath);
                }
            }
        }
        if (this.parallel) await Promise.all(downloads);
    }
}
