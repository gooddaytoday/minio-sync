import * as uuid from "uuid";
import { IMinIOConfig } from "../src/minio";

export module testsCommon {
    export function GenMinIOConfig(
        listenUpdates: boolean = false
    ): IMinIOConfig {
        const uid = uuid.v4();
        return {
            Bucket: "test-store-" + uid,
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
