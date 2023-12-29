import { IPermissions, IStorage, Manager } from "../src/manager";
import { IMinIOConfig } from "../src/minio";
import { GUID, TObjItem } from "../src/utils";
import { IWatchOptions, Watcher } from "../src/watcher";
import { ManagerWrapper } from "./ManagerWrapper";

function emptyPromiseMock(timeout: number = 100): jest.Mock {
    return jest.fn(() => new Promise(resolve => setTimeout(resolve, timeout)));
}

export module testsCommon {
    export const rootPath = __dirname;
    export const DefaultObjectName = "example.txt";
    export const AllPermissions: IPermissions = {
        Read: true,
        Write: true,
    };

    interface IInit {
        storage: IStorage;
        manager: ManagerWrapper;
        watcher: Watcher;
    }

    export async function Init(
        permissions: IPermissions = AllPermissions,
        watchOptions?: IWatchOptions
    ): Promise<IInit> {
        const storage = CreateStorage();
        const manager = new ManagerWrapper(rootPath, storage, permissions);
        const watcher = new Watcher(
            rootPath,
            manager as unknown as Manager,
            watchOptions
        );
        await new Promise(resolve => watcher.OnSyncEnd(() => resolve(null)));
        return { storage: storage, manager: manager, watcher: watcher };
    }

    export function CreateStorage(
        objects: Map<string, TObjItem> = new Map()
    ): IStorage {
        return {
            AddObjectsListener: jest.fn(),
            Objects: objects,
            UploadFile: emptyPromiseMock(),
            UpdateFile: emptyPromiseMock(),
            DeleteFile: emptyPromiseMock(),
            DownloadFile: emptyPromiseMock(),
            RemoveBucket: emptyPromiseMock(),
        };
    }

    export function GenMinIOConfig(
        listenUpdates: boolean = false
    ): IMinIOConfig {
        return {
            Bucket: "test-store-" + GUID(),
            ListenUpdates: listenUpdates,
            EndPoint: "127.0.0.1",
            Port: 9000,
            UseSSL: false,
            AccessKey: process.env.MINIO_ACCESS_KEY || "T77RlV64b2pQpK71UPuA",
            SecretKey:
                process.env.MINIO_SECRET_KEY ||
                "atvLX0bUmtEJEEFjIh45RVpJFa45ODfBvJd3GFqS",
        };
    }

    type TTaskCb = (() => void) | jest.Mock;

    export function Task(
        cb: TTaskCb = jest.fn(),
        timeout: number = 100
    ): Promise<void> {
        return new Promise((resolve, reject) =>
            setTimeout(function () {
                try {
                    cb();
                    resolve();
                } catch (e) {
                    reject(e);
                }
            }, timeout)
        );
    }
}
