import queue from "p-queue";
import {
    IManager,
    IPermissions,
    IStorage,
    Manager as ManagerClass,
    ObjectEvent,
} from "../src/manager";
import Queueing from "../src/queueing";

/** Wrapper over Manager class */
export class ManagerWrapper implements IManager {
    private manager: ManagerClass;

    constructor(
        rootPath: string,
        storage: IStorage,
        permissions: IPermissions
    ) {
        this.manager = new ManagerClass(rootPath, storage, permissions);
    }

    public GetQueue(objectName: string): queue | undefined {
        return this.queueing["queueMap"].get(objectName);
    }

    public get rootPath(): string {
        return this.manager["rootPath"];
    }

    public get storage(): IStorage {
        return this.manager["storage"];
    }

    public get permissions(): IPermissions {
        return this.manager["permissions"];
    }

    public get queueing(): Queueing {
        return this.manager["queueing"];
    }

    public get OnSyncEndCb(): (() => void) | undefined {
        return this.manager["onSyncEndCb"];
    }

    private OnObjectEvent(
        event: ObjectEvent,
        objectName: string
    ): Promise<void> {
        return this.manager["OnObjectEvent"](event, objectName);
    }

    private DownloadObjects(): Promise<void> {
        return this.manager["DownloadObjects"]();
    }

    public UploadFile(objectName: string, filePath: string): void {
        this.manager.UploadFile(objectName, filePath);
    }

    public UpdateFile(objectName: string, filePath: string): void {
        this.manager.UpdateFile(objectName, filePath);
    }

    public DeleteFile(objectName: string): void {
        this.manager.DeleteFile(objectName);
    }

    public Sync(): void {
        this.manager.Sync();
    }

    public OnSyncEnd(cb: () => void): void {
        this.manager.OnSyncEnd(cb);
    }
}
