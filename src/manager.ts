import { exists, stat } from "fs-extra";
import * as path from "path";
import { CalcEtag, Log } from "./utils";

type TObjItem = {
    size: number;
    etag: string | null;
};

interface IStorage {
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

export class Manager {
    private rootPath: string;
    private storage: IStorage;
    private permissions: IPermissions;

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
            void this.storage.UploadFile(objectName, filePath);
        }
    }

    public UpdateFile(objectName: string, filePath: string): void {
        if (!this.permissions.Write) {
            Log(`UpdateFile ${filePath}: Write permission denied`);
        } else {
            void this.storage.UpdateFile(objectName, filePath);
        }
    }

    public DeleteFile(objectName: string): void {
        if (!this.permissions.Write) {
            Log(`DeleteFile ${objectName}: Write permission denied`);
        } else {
            void this.storage.DeleteFile(objectName);
        }
    }

    public Sync(): void {
        (async () => {
            try {
                Log(" --- SYNC ---");
                if (!this.permissions.Read) {
                    Log("Sync: Read permission denied");
                } else {
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
                        downloads.push(
                            this.storage.DownloadFile(obj, fullpath)
                        );
                    }
                    await Promise.all(downloads);
                }
            } finally {
                Log(" --- SYNC ENDED ---");
            }
        })().catch(e => {
            console.error("Error while syncing", e);
            throw e;
        });
    }
}
