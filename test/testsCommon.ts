import { IStorage } from "../src/manager";
import { IMinIOConfig } from "../src/minio";
import { GUID, TObjItem } from "../src/utils";

function emptyPromiseMock(timeout: number = 100): jest.Mock {
    return jest.fn(() => new Promise(resolve => setTimeout(resolve, timeout)));
}

export module testsCommon {
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
            AccessKey: process.env.MINIO_ACCESS_KEY || "nPRQd3IyCfMBV8HUjmyy",
            SecretKey:
                process.env.MINIO_SECRET_KEY ||
                "dYcdcLpIzgGSwL23m86hA304PtctxNPpXmgZkTAa",
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
