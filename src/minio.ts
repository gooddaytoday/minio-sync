import * as fs from "fs-extra";
import * as minio from "minio";
import * as os from "os";
import { ObjectEvent, TObjectsListener } from "./manager";
import { CalcEtag, Log, TObjItem } from "./utils";

export interface IMinIOConfig {
    Bucket: string;
    ListenUpdates: boolean;
    EndPoint: string;
    Port: number;
    UseSSL: boolean;
    AccessKey: string;
    SecretKey: string;
}

interface IMinIONotificationEvent {
    eventName: string;
    s3: {
        object: {
            key: string;
        };
    };
}

const ToManagerObjEvent = {
    [minio.ObjectCreatedPut]: ObjectEvent.Create,
    [minio.ObjectCreatedCompleteMultipartUpload]: ObjectEvent.Create,
    [minio.ObjectCreatedPost]: ObjectEvent.Create,
    [minio.ObjectCreatedCopy]: ObjectEvent.Create,
    [minio.ObjectRemovedDelete]: ObjectEvent.Delete,
    [minio.ObjectRemovedDeleteMarkerCreated]: ObjectEvent.Delete,
};

export default class MinIO {
    private client: minio.Client;
    private bucket: string;
    private objects = new Map<string, TObjItem>();
    private listener: minio.NotificationPoller | undefined;
    private objectsListener: TObjectsListener | undefined;

    constructor(config: IMinIOConfig) {
        this.bucket = config.Bucket;
        this.client = new minio.Client({
            endPoint: config.EndPoint,
            port: config.Port,
            useSSL: config.UseSSL,
            accessKey: config.AccessKey,
            secretKey: config.SecretKey,
        });
        if (config.ListenUpdates) {
            this.listener = this.client.listenBucketNotification(
                this.Bucket,
                "",
                "",
                [minio.ObjectCreatedAll, minio.ObjectRemovedAll]
            );
        }
    }

    public async Init(): Promise<void> {
        if (!(await this.client.bucketExists(this.bucket))) {
            await this.client.makeBucket(this.bucket);
        }
        // Getting all existed objects
        const objects = await this.GetObjects();
        for (const [name, obj] of objects) {
            if (!obj.etag) throw new Error(`No etag in object ${name}`);
            this.objects.set(name, {
                size: obj.size,
                etag: obj.etag,
            });
        }
        // Listen for new objects
        if (this.listener)
            this.listener.on(
                "notification",
                (event: IMinIONotificationEvent) => {
                    if (this.objectsListener) {
                        const mappedEvent = ToManagerObjEvent[event.eventName];
                        this.objectsListener(
                            mappedEvent,
                            event.s3.object.key
                        ).catch(e => {
                            console.error("Error in objectsListener", e);
                            throw e;
                        });
                    } else {
                        throw new Error("Not set objectsListener");
                    }
                }
            );
    }

    public AddObjectsListener(cb: TObjectsListener): void {
        this.objectsListener = cb;
    }

    public get Client(): minio.Client {
        return this.client;
    }

    public get Bucket(): string {
        return this.bucket;
    }

    public get Objects(): Map<string, TObjItem> {
        return this.objects;
    }

    public async UploadFile(
        objectName: string,
        filePath: string
    ): Promise<void> {
        try {
            objectName = ProcessObjectName(objectName);
            const res = await this.PutObject(objectName, filePath);
            if (res)
                Log(
                    `File uploaded successfully to ${this.bucket}/${objectName}`
                );
        } catch (error) {
            console.error("Error uploading file:", error);
            throw error;
        }
    }

    private async PutObject(
        objectName: string,
        filePath: string
    ): Promise<minio.UploadedObjectInfo | undefined> {
        const [stat, etag] = await Promise.all([
            fs.stat(filePath),
            CalcEtag(filePath),
        ]);

        if (this.objects.has(objectName)) {
            const obj = this.objects.get(objectName)!;
            if (
                (obj.size == 0 && stat.size == 0) ||
                (obj.size === stat.size && obj.etag === etag)
            ) {
                Log(
                    `       File ${objectName} already exists in ${this.bucket}`
                );
                return;
            }
        }

        this.objects.set(objectName, {
            size: stat.size,
            etag: etag,
        });
        return this.client.fPutObject(this.bucket, objectName, filePath, {});
    }

    public async UpdateFile(
        objectName: string,
        filePath: string
    ): Promise<void> {
        try {
            objectName = ProcessObjectName(objectName);
            if (!this.objects.has(objectName)) {
                throw new Error(`UpdateFile: File ${objectName} not found`);
            }
            const res = await this.PutObject(objectName, filePath);
            if (res)
                Log(
                    `File updated successfully in ${this.bucket}/${objectName}`
                );
        } catch (error) {
            Log("Error updating file:", error);
            throw error;
        }
    }

    public async DeleteFile(objectName: string): Promise<void> {
        try {
            objectName = ProcessObjectName(objectName);
            if (!this.objects.has(objectName)) {
                throw new Error(`DeleteFile: File ${objectName} not found`);
            }
            await this.client.removeObject(this.bucket, objectName);
            this.objects.delete(objectName);
            Log(`File deleted successfully from ${this.bucket}/${objectName}`);
        } catch (error) {
            Log("Error deleting file:", error);
            throw error;
        }
    }

    public async DownloadFile(
        objectName: string,
        filePath: string
    ): Promise<void> {
        try {
            objectName = ProcessObjectName(objectName);
            await this.client.fGetObject(this.bucket, objectName, filePath);
            Log(
                `File downloaded successfully from ${this.bucket}/${objectName}`
            );
        } catch (error) {
            console.error("Error downloading file:", error);
            throw error;
        }
    }
    public async RemoveBucket(): Promise<void> {
        try {
            // remove all objects
            const objects = await this.GetObjects();
            const objectsNames = Array.from(objects.keys());
            await this.client.removeObjects(this.bucket, objectsNames);
            // remove bucket
            await this.client.removeBucket(this.bucket);
            Log(`Bucket ${this.bucket} deleted successfully`);
        } catch (error) {
            console.error("Error deleting bucket:", error);
            throw error;
        }
    }

    private async GetObjects(): Promise<Map<string, minio.BucketItem>> {
        const result = new Map<string, minio.BucketItem>();
        const list = this.client.listObjects(this.bucket, undefined, true);
        list.on("data", item => {
            if (item.name) {
                result.set(item.name, item);
            } else {
                Log("No item name: ", item);
            }
        });
        await new Promise((resolve, reject) => {
            list.on("close", resolve);
            list.on("error", err => {
                console.error("Error while listing MinIO objects", err);
                reject(err);
            });
        });
        return result;
    }
}

const win = os.platform() === "win32";

export function ProcessObjectName(objectName: string): string {
    return win ? objectName.replace(/\\/g, "/") : objectName; // Deduplicate \\ in objectName in case of Windows and replace \ with /
}
